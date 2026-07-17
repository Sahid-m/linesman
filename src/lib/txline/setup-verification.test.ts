import { BorshInstructionCoder, type Idl } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import bs58 from "bs58";
import { describe, expect, it } from "vitest";

import { getNetworkConfig } from "@/lib/network/config";
import devnetIdl from "./idl/devnet.json";
import {
  assertActivationMessageTransition,
  verifySubscriptionTransaction,
} from "./setup-verification";

const idl = devnetIdl as Idl;
const config = getNetworkConfig("devnet");
const programId = new PublicKey(config.programId);
const wallet = Keypair.generate().publicKey;
const mint = new PublicKey(config.txlMint);
const [pricingMatrix] = PublicKey.findProgramAddressSync(
  [Buffer.from("pricing_matrix")],
  programId,
);
const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("token_treasury_v2")],
  programId,
);
const accounts = [
  wallet,
  pricingMatrix,
  mint,
  getAssociatedTokenAddressSync(mint, wallet, false, TOKEN_2022_PROGRAM_ID),
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

function subscribeInstruction(
  serviceLevelId = 1,
  weeks = 4,
  instructionAccounts = accounts,
) {
  const data = new BorshInstructionCoder(idl).encode("subscribe", {
    service_level_id: serviceLevelId,
    weeks,
  });
  return {
    programId,
    accounts: instructionAccounts,
    data: bs58.encode(data),
  };
}

describe("subscription transaction verification", () => {
  it("accepts only the selected wallet's exact four-week subscription", () => {
    expect(
      verifySubscriptionTransaction({
        instructions: [subscribeInstruction()],
        signerKeys: [wallet],
        wallet,
        config,
        idl,
        serviceLevelId: 1,
      }),
    ).toEqual({ serviceLevelId: 1, durationWeeks: 4 });
  });

  it.each([
    ["wrong instruction", { instructions: [] }],
    ["wrong service", { instructions: [subscribeInstruction(12)] }],
    ["wrong duration", { instructions: [subscribeInstruction(1, 3)] }],
    ["wallet did not sign", { signerKeys: [] }],
    [
      "wrong account derivation",
      {
        instructions: [
          subscribeInstruction(
            1,
            4,
            accounts.map((account, index) =>
              index === 1 ? Keypair.generate().publicKey : account,
            ),
          ),
        ],
      },
    ],
  ])("rejects %s", (_label, overrides) => {
    expect(() =>
      verifySubscriptionTransaction({
        instructions: [subscribeInstruction()],
        signerKeys: [wallet],
        wallet,
        config,
        idl,
        serviceLevelId: 1,
        ...overrides,
      }),
    ).toThrow();
  });
});

describe("activation-message state protection", () => {
  it("allows an idempotent subscribed transition for the same transaction", () => {
    expect(
      assertActivationMessageTransition(
        {
          setupState: "subscribed",
          subscriptionTxSignature: "same-transaction",
          serviceLevelId: 1,
          durationWeeks: 4,
        },
        "same-transaction",
        1,
      ),
    ).toBe("idempotent");
  });

  it.each([
    ["activated", "same-transaction", 1],
    ["subscribed", "different-transaction", 1],
    ["subscribed", "same-transaction", 12],
  ] as const)("rejects unsafe %s transitions", (setupState, tx, service) => {
    expect(() =>
      assertActivationMessageTransition(
        {
          setupState,
          subscriptionTxSignature: "same-transaction",
          serviceLevelId: 1,
          durationWeeks: 4,
        },
        tx,
        service,
      ),
    ).toThrow();
  });
});
