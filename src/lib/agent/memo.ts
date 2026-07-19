import "server-only";

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import bs58 from "bs58";

import { getNetworkConfig, type Network } from "@/lib/network/config";

// The SPL Memo program: no accounts required, data is the raw UTF-8 memo.
const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);

let cachedSigner: Keypair | undefined;

export function getAgentSigner(): Keypair {
  if (cachedSigner) return cachedSigner;
  const secret = process.env.AGENT_DEVNET_SECRET_KEY_BASE58;
  if (!secret) throw new Error("AGENT_DEVNET_SECRET_KEY_BASE58 is required");
  cachedSigner = Keypair.fromSecretKey(bs58.decode(secret));
  return cachedSigner;
}

export type DecisionMemoInput = {
  fixtureId: number;
  eventSeq: number;
  eventAction: string;
  side: "home" | "away";
  counterpartyVenue: string;
  entryFairValue: number;
  timestamp: number;
};

function toMemoText(input: DecisionMemoInput): string {
  return JSON.stringify({
    t: "groundtruth_trade",
    fixtureId: input.fixtureId,
    seq: input.eventSeq,
    action: input.eventAction,
    side: input.side,
    counterparty: input.counterpartyVenue,
    entryFairValue: input.entryFairValue,
    ts: input.timestamp,
  });
}

/**
 * Logs a decision as an on-chain SPL Memo, signed by the agent's own devnet
 * keypair (never the TxLINE user's wallet) — a tamper-proof, timestamped
 * record of the trade without needing a custom Anchor program.
 */
export async function logDecisionMemo(
  network: Network,
  input: DecisionMemoInput,
): Promise<string> {
  const signer = getAgentSigner();
  const connection = new Connection(getNetworkConfig(network).rpcUrl, "confirmed");

  const transaction = new Transaction().add(
    new TransactionInstruction({
      keys: [{ pubkey: signer.publicKey, isSigner: true, isWritable: false }],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(toMemoText(input), "utf8"),
    }),
  );

  return connection.sendTransaction(transaction, [signer], {
    preflightCommitment: "confirmed",
  });
}
