import type { Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  assertSameOrigin,
  enforceRateLimit,
  requireSession,
} from "@/lib/auth/session";
import { getNetworkConfig } from "@/lib/network/config";
import { buildActivationMessage } from "@/lib/txline/activation";
import {
  getCredential,
  upsertCredentialState,
} from "@/lib/txline/credentials";
import devnetIdl from "@/lib/txline/idl/devnet.json";
import mainnetIdl from "@/lib/txline/idl/mainnet.json";
import {
  assertActivationMessageTransition,
  verifySubscriptionTransaction,
} from "@/lib/txline/setup-verification";

const requestSchema = z.object({
  network: z.enum(["devnet", "mainnet"]),
  txSignature: z.string().min(32),
  serviceLevelId: z.number().int().positive(),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const input = requestSchema.parse(await request.json());
    enforceRateLimit(`setup:${session.userId}:${input.network}`, 8);
    const config = getNetworkConfig(input.network);
    if (!config.serviceLevels.includes(input.serviceLevelId)) {
      throw new Error("Unsupported service level");
    }
    const credential = await getCredential(session.userId, input.network);
    if (!credential) throw new Error("Create a guest credential first");
    const transition = assertActivationMessageTransition(
      credential,
      input.txSignature,
      input.serviceLevelId,
    );

    const transaction = await new Connection(config.rpcUrl, "confirmed")
      .getParsedTransaction(input.txSignature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
    if (!transaction || transaction.meta?.err) {
      throw new Error("Subscription transaction is not confirmed");
    }
    const wallet = new PublicKey(session.walletPublicKey);
    const idl = (
      input.network === "devnet" ? devnetIdl : mainnetIdl
    ) as Idl;
    verifySubscriptionTransaction({
      instructions: transaction.transaction.message.instructions,
      signerKeys: transaction.transaction.message.accountKeys
        .filter((account) => account.signer)
        .map((account) => account.pubkey),
      wallet,
      config,
      idl,
      serviceLevelId: input.serviceLevelId,
    });

    if (transition === "initial") {
      const subscriptionCreatedAt = new Date(
        (transaction.blockTime ?? Math.floor(Date.now() / 1_000)) * 1_000,
      );
      await upsertCredentialState({
        userId: session.userId,
        network: input.network,
        jwt: credential.jwt,
        setupState: "subscribed",
        subscriptionTxSignature: input.txSignature,
        serviceLevelId: input.serviceLevelId,
        durationWeeks: 4,
        subscriptionCreatedAt,
      });
    }
    return NextResponse.json({
      message: buildActivationMessage(input.txSignature, credential.jwt),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Setup failed";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 400 },
    );
  }
}
