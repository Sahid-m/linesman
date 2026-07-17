import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { getNetworkConfig } from "@/lib/network/config";
import {
  getCredential,
  upsertCredentialState,
} from "@/lib/txline/credentials";

const requestSchema = z.object({
  network: z.enum(["devnet", "mainnet"]),
  walletSignature: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const { network, walletSignature } = requestSchema.parse(
      await request.json(),
    );
    const credential = await getCredential(session.userId, network);
    if (
      !credential ||
      credential.setupState !== "subscribed" ||
      !credential.subscriptionTxSignature ||
      credential.serviceLevelId == null ||
      credential.durationWeeks !== 4 ||
      !credential.subscriptionCreatedAt
    ) {
      throw new Error("Confirm the subscription before activation");
    }
    const response = await fetch(
      `${getNetworkConfig(network).apiOrigin}/api/token/activate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${credential.jwt}`,
        },
        body: JSON.stringify({
          txSig: credential.subscriptionTxSignature,
          walletSignature,
          leagues: [],
        }),
        cache: "no-store",
      },
    );
    if (!response.ok) throw new Error(`TxLINE activation failed (${response.status})`);
    const result: unknown = await response.json();
    const apiToken =
      typeof result === "string"
        ? result
        : typeof result === "object" &&
            result !== null &&
            "token" in result &&
            typeof result.token === "string"
          ? result.token
          : null;
    if (!apiToken) throw new Error("TxLINE activation returned no API token");
    await upsertCredentialState({
      userId: session.userId,
      network,
      jwt: credential.jwt,
      apiToken,
      setupState: "activated",
      subscriptionTxSignature: credential.subscriptionTxSignature,
      serviceLevelId: credential.serviceLevelId,
      durationWeeks: 4,
      subscriptionCreatedAt: credential.subscriptionCreatedAt,
    });
    return NextResponse.json({ state: "activated", network });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Activation failed";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 400 },
    );
  }
}
