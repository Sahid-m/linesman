import bs58 from "bs58";
import { NextResponse } from "next/server";
import nacl from "tweetnacl";
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
import { clearLiveIdentityCache } from "@/lib/sources/manager";

const requestSchema = z.object({
  network: z.enum(["devnet", "mainnet"]),
  walletSignature: z.string().min(1),
});

async function activateWithTxline(input: {
  apiOrigin: string;
  jwt: string;
  txSig: string;
  walletSignature: string;
}): Promise<{ ok: true; token: string } | { ok: false; status: number; detail: string }> {
  const response = await fetch(`${input.apiOrigin}/api/token/activate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.jwt}`,
    },
    body: JSON.stringify({
      txSig: input.txSig,
      walletSignature: input.walletSignature,
      leagues: [],
    }),
    cache: "no-store",
  });
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // keep raw text
  }
  if (!response.ok) {
    const detail =
      typeof parsed === "object" &&
      parsed !== null &&
      "message" in parsed &&
      typeof parsed.message === "string"
        ? parsed.message
        : typeof parsed === "object" &&
            parsed !== null &&
            "error" in parsed &&
            typeof parsed.error === "string"
          ? parsed.error
          : text.slice(0, 300) || response.statusText;
    return { ok: false, status: response.status, detail };
  }
  const token =
    typeof parsed === "string"
      ? parsed
      : typeof parsed === "object" &&
          parsed !== null &&
          "token" in parsed &&
          typeof parsed.token === "string"
        ? parsed.token
        : null;
  if (!token) {
    return {
      ok: false,
      status: 502,
      detail: "TxLINE activation returned no API token",
    };
  }
  return { ok: true, token };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const { network, walletSignature } = requestSchema.parse(
      await request.json(),
    );
    enforceRateLimit(`setup:${session.userId}:${network}`, 8);
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

    let signatureBytes: Uint8Array;
    try {
      signatureBytes = Buffer.from(walletSignature, "base64");
    } catch {
      throw new Error("Activation signature is not valid base64");
    }
    if (signatureBytes.length !== nacl.sign.signatureLength) {
      throw new Error(
        `Activation signature must be ${nacl.sign.signatureLength} bytes (got ${signatureBytes.length})`,
      );
    }
    const message = new TextEncoder().encode(
      buildActivationMessage(
        credential.subscriptionTxSignature,
        credential.jwt,
      ),
    );
    const verified = nacl.sign.detached.verify(
      message,
      signatureBytes,
      bs58.decode(session.walletPublicKey),
    );
    if (!verified) {
      throw new Error(
        "Activation signature does not match this wallet and message. Re-run setup and approve the Phantom message request.",
      );
    }

    const apiOrigin = getNetworkConfig(network).apiOrigin;
    let lastDetail = "Activation failed";
    let lastStatus = 400;
    // TxLINE may need a moment to observe the confirmed subscribe transaction.
    for (const waitMs of [0, 2_000, 4_000]) {
      if (waitMs) await sleep(waitMs);
      const result = await activateWithTxline({
        apiOrigin,
        jwt: credential.jwt,
        txSig: credential.subscriptionTxSignature,
        walletSignature,
      });
      if (result.ok) {
        await upsertCredentialState({
          userId: session.userId,
          network,
          jwt: credential.jwt,
          apiToken: result.token,
          setupState: "activated",
          subscriptionTxSignature: credential.subscriptionTxSignature,
          serviceLevelId: credential.serviceLevelId,
          durationWeeks: 4,
          subscriptionCreatedAt: credential.subscriptionCreatedAt,
        });
        clearLiveIdentityCache();
        return NextResponse.json({ state: "activated", network });
      }
      lastDetail = result.detail;
      lastStatus = result.status;
      // Do not retry auth / signature failures.
      if (result.status === 401 || result.status === 403) break;
    }

    throw new Error(`TxLINE activation failed (${lastStatus}): ${lastDetail}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Activation failed";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 400 },
    );
  }
}
