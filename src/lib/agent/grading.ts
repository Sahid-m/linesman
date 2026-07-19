import "server-only";

import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import BN from "bn.js";
import { Connection, PublicKey } from "@solana/web3.js";
import { and, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { agentPositions } from "@/db/schema";
import { getNetworkConfig, type Network } from "@/lib/network/config";
import { txlineFetch } from "@/lib/txline/client";
import devnetIdl from "@/lib/txline/idl/devnet.json";
import mainnetIdl from "@/lib/txline/idl/mainnet.json";
import {
  assertProofMatchesRequest,
  formatStatValidationProof,
  validationComputeBudgetInstruction,
} from "@/lib/txline/validation";
import { getAgentSigner } from "./memo";

const HOME_GOALS_STAT_KEY = 1;
const AWAY_GOALS_STAT_KEY = 2;

export type FinalScoreReceipt = {
  valid: boolean;
  homeGoals: number;
  awayGoals: number;
  epochDay: number;
  rootPda: string;
  timestamp: number;
};

/**
 * Fetches and on-chain-verifies the final home/away goal tally for a
 * fixture at the final-whistle seq — the same validateStatV2 `.view()` call
 * /api/txline/validate makes, but callable from the standalone agent
 * process (no browser session), simulated as the agent's own funded
 * devnet signer instead of a user's wallet.
 */
export async function fetchFinalScoreReceipt(
  userId: string,
  network: Network,
  fixtureId: number,
  seq: number,
): Promise<FinalScoreReceipt> {
  const search = new URLSearchParams({
    fixtureId: String(fixtureId),
    seq: String(seq),
    statKeys: `${HOME_GOALS_STAT_KEY},${AWAY_GOALS_STAT_KEY}`,
  });
  const upstream = await txlineFetch(
    userId,
    network,
    `/api/scores/stat-validation?${search}`,
  );
  if (!upstream.ok) {
    const detail = await upstream.text();
    throw new Error(`Proof request failed (${upstream.status}): ${detail.slice(0, 200)}`);
  }
  const formatted = formatStatValidationProof(await upstream.json());
  assertProofMatchesRequest(formatted, fixtureId, [
    HOME_GOALS_STAT_KEY,
    AWAY_GOALS_STAT_KEY,
  ]);

  const config = getNetworkConfig(network);
  const idl = (network === "devnet" ? devnetIdl : mainnetIdl) as Idl;
  if (idl.address !== config.programId) throw new Error("IDL network mismatch");

  const connection = new Connection(config.rpcUrl, "confirmed");
  const signer = getAgentSigner();
  const readOnlyWallet: ConstructorParameters<typeof AnchorProvider>[1] = {
    publicKey: signer.publicKey,
    signTransaction: async (transaction) => transaction,
    signAllTransactions: async (transactions) => transactions,
  };
  const provider = new AnchorProvider(connection, readOnlyWallet, {
    commitment: "confirmed",
  });
  const program = new Program(idl, provider);
  const epochDay = Math.floor(formatted.minTimestamp / 86_400_000);
  const [dailyScoresPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("daily_scores_roots"), new BN(epochDay).toBuffer("le", 2)],
    program.programId,
  );
  const valid = await program.methods
    .validateStatV2(formatted.payload, formatted.strategy)
    .preInstructions([validationComputeBudgetInstruction()])
    .accounts({ dailyScoresMerkleRoots: dailyScoresPda })
    .view();

  const homeGoals = formatted.statValues.find((s) => s.key === HOME_GOALS_STAT_KEY)?.value;
  const awayGoals = formatted.statValues.find((s) => s.key === AWAY_GOALS_STAT_KEY)?.value;
  if (homeGoals === undefined || awayGoals === undefined) {
    throw new Error("Final score proof missing home/away goal stats");
  }

  return {
    valid: Boolean(valid),
    homeGoals,
    awayGoals,
    epochDay,
    rootPda: dailyScoresPda.toBase58(),
    timestamp: formatted.minTimestamp,
  };
}

/**
 * Grades every open position for a finished fixture against a
 * cryptographically verified final score: 1 if the backed side actually
 * won, 0 otherwise (including draws, since neither side "won"). PnL
 * follows the linear probability-contract convention used by the venues
 * themselves — size * (settledFairValue - entryFairValue).
 */
export async function gradeFixturePositions(
  userId: string,
  network: Network,
  fixtureId: number,
  finalSeq: number,
): Promise<number> {
  const receipt = await fetchFinalScoreReceipt(userId, network, fixtureId, finalSeq);
  if (!receipt.valid) {
    throw new Error("On-chain proof did not validate the final score");
  }
  const winner: "home" | "away" | null =
    receipt.homeGoals > receipt.awayGoals
      ? "home"
      : receipt.awayGoals > receipt.homeGoals
        ? "away"
        : null;

  const db = getDb();
  const openPositions = await db.query.agentPositions.findMany({
    where: (position, { and: whereAnd, eq: whereEq }) =>
      whereAnd(
        whereEq(position.fixtureId, fixtureId),
        whereEq(position.network, network),
        whereEq(position.status, "open"),
      ),
  });

  for (const position of openPositions) {
    const settledFairValue = position.side === winner ? 1 : 0;
    const pnl = Number(position.size) * (settledFairValue - Number(position.entryFairValue));
    await db
      .update(agentPositions)
      .set({
        status: "graded",
        settledFairValue: settledFairValue.toFixed(4),
        pnl: pnl.toFixed(4),
        proofReceipt: receipt,
        gradedAt: new Date(),
      })
      .where(
        and(eq(agentPositions.id, position.id), eq(agentPositions.status, "open")),
      );
  }
  return openPositions.length;
}
