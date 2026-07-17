import { BorshInstructionCoder, type Idl } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { PublicKey, SystemProgram } from "@solana/web3.js";

import type { NetworkConfig } from "@/lib/network/config";

type InstructionLike = {
  programId: PublicKey;
  accounts?: PublicKey[];
  data?: string;
};

type SetupStateLike = {
  setupState: "guest_created" | "subscribed" | "activated";
  subscriptionTxSignature: string | null;
  serviceLevelId: number | null;
  durationWeeks: number | null;
};

function expectedSubscriptionAccounts(
  wallet: PublicKey,
  config: NetworkConfig,
): PublicKey[] {
  const programId = new PublicKey(config.programId);
  const mint = new PublicKey(config.txlMint);
  const [pricingMatrix] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_matrix")],
    programId,
  );
  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_treasury_v2")],
    programId,
  );

  return [
    wallet,
    pricingMatrix,
    mint,
    getAssociatedTokenAddressSync(
      mint,
      wallet,
      false,
      TOKEN_2022_PROGRAM_ID,
    ),
    getAssociatedTokenAddressSync(
      mint,
      tokenTreasuryPda,
      true,
      TOKEN_2022_PROGRAM_ID,
    ),
    tokenTreasuryPda,
    TOKEN_2022_PROGRAM_ID,
    SystemProgram.programId,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  ];
}

export function verifySubscriptionTransaction({
  instructions,
  signerKeys,
  wallet,
  config,
  idl,
  serviceLevelId,
}: {
  instructions: readonly InstructionLike[];
  signerKeys: readonly PublicKey[];
  wallet: PublicKey;
  config: NetworkConfig;
  idl: Idl;
  serviceLevelId: number;
}): { serviceLevelId: number; durationWeeks: 4 } {
  if (idl.address !== config.programId) {
    throw new Error("IDL network mismatch");
  }
  if (!config.serviceLevels.includes(serviceLevelId)) {
    throw new Error("Unsupported service level");
  }
  if (!signerKeys.some((key) => key.equals(wallet))) {
    throw new Error("Authenticated wallet did not sign this transaction");
  }

  const programId = new PublicKey(config.programId);
  const programInstructions = instructions.filter((instruction) =>
    instruction.programId.equals(programId),
  );
  if (programInstructions.length !== 1) {
    throw new Error("Transaction must contain exactly one TxLINE instruction");
  }

  const instruction = programInstructions[0];
  if (!instruction.data || !instruction.accounts) {
    throw new Error("TxLINE instruction is not decodable");
  }
  const decoded = new BorshInstructionCoder(idl).decode(
    instruction.data,
    "base58",
  );
  if (!decoded || decoded.name !== "subscribe") {
    throw new Error("TxLINE instruction is not subscribe");
  }
  const data = decoded.data as {
    service_level_id?: unknown;
    weeks?: unknown;
  };
  if (data.service_level_id !== serviceLevelId || data.weeks !== 4) {
    throw new Error("Subscription terms do not match the requested terms");
  }

  const expectedAccounts = expectedSubscriptionAccounts(wallet, config);
  if (
    instruction.accounts.length !== expectedAccounts.length ||
    instruction.accounts.some(
      (account, index) => !account.equals(expectedAccounts[index]),
    )
  ) {
    throw new Error("Subscription accounts do not match expected derivations");
  }

  return { serviceLevelId, durationWeeks: 4 };
}

export function assertActivationMessageTransition(
  credential: SetupStateLike,
  txSignature: string,
  serviceLevelId: number,
): "initial" | "idempotent" {
  if (credential.setupState === "activated") {
    throw new Error("Credential is already activated");
  }
  if (credential.setupState === "guest_created") return "initial";
  if (
    credential.subscriptionTxSignature !== txSignature ||
    credential.serviceLevelId !== serviceLevelId ||
    credential.durationWeeks !== 4
  ) {
    throw new Error("Subscription confirmation does not match stored state");
  }
  return "idempotent";
}
