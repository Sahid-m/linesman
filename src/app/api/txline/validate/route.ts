import {
  AnchorProvider,
  Program,
  type Idl,
} from "@coral-xyz/anchor";
import BN from "bn.js";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  assertSameOrigin,
  enforceRateLimit,
  requireSession,
} from "@/lib/auth/session";
import { getNetworkConfig } from "@/lib/network/config";
import { txlineFetch } from "@/lib/txline/client";
import devnetIdl from "@/lib/txline/idl/devnet.json";
import mainnetIdl from "@/lib/txline/idl/mainnet.json";
import {
  assertProofMatchesRequest,
  formatStatValidationProof,
  validationComputeBudgetInstruction,
} from "@/lib/txline/validation";

const requestSchema = z.object({
  network: z.enum(["devnet", "mainnet"]),
  fixtureId: z.number().int().positive().safe(),
  seq: z.number().int().nonnegative().safe(),
  statKeys: z
    .array(z.number().int().nonnegative().safe())
    .min(1)
    .max(8)
    .refine((keys) => new Set(keys).size === keys.length, {
      message: "Stat keys must be unique",
    }),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const input = requestSchema.parse(await request.json());
    enforceRateLimit(`validate:${session.userId}:${input.network}`, 20);
    const search = new URLSearchParams({
      fixtureId: String(input.fixtureId),
      seq: String(input.seq),
      statKeys: input.statKeys.join(","),
    });
    const upstream = await txlineFetch(
      session.userId,
      input.network,
      `/api/scores/stat-validation?${search}`,
    );
    if (!upstream.ok) throw new Error(`Proof request failed (${upstream.status})`);
    const formatted = formatStatValidationProof(await upstream.json());
    assertProofMatchesRequest(formatted, input.fixtureId, input.statKeys);

    const config = getNetworkConfig(input.network);
    const idl = (input.network === "devnet" ? devnetIdl : mainnetIdl) as Idl;
    if (idl.address !== config.programId) throw new Error("IDL network mismatch");
    const viewer = Keypair.generate();
    const readOnlyWallet: ConstructorParameters<typeof AnchorProvider>[1] = {
      publicKey: viewer.publicKey,
      signTransaction: async (transaction) => transaction,
      signAllTransactions: async (transactions) => transactions,
    };
    const provider = new AnchorProvider(
      new Connection(config.rpcUrl, "confirmed"),
      readOnlyWallet,
      { commitment: "confirmed" },
    );
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
    return NextResponse.json({
      valid,
      fixtureId: formatted.fixtureId,
      requestedSeq: input.seq,
      stats: formatted.statValues,
      timestamp: formatted.minTimestamp,
      epochDay,
      rootPda: dailyScoresPda.toBase58(),
      proofNodeCounts: formatted.proofNodeCounts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Validation failed";
    const category = message.startsWith("Malformed proof")
      ? "malformed_proof"
      : message.includes("Incomplete")
        ? "incomplete_stat_coverage"
        : message.toLowerCase().includes("root")
          ? "root_mismatch"
          : "validation_failed";
    return NextResponse.json({ error: message, category }, { status: 400 });
  }
}
