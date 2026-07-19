import { NextResponse } from "next/server";
import { z } from "zod";

import {
  assertSameOrigin,
  enforceRateLimit,
  requireSession,
} from "@/lib/auth/session";
import { getNetworkConfig } from "@/lib/network/config";
import { resetCredentialForResubscribe } from "@/lib/txline/credentials";
import { clearLiveIdentityCache } from "@/lib/sources/manager";

const requestSchema = z.object({
  network: z.enum(["devnet", "mainnet"]),
  renewGuest: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const { network, renewGuest } = requestSchema.parse(await request.json());
    enforceRateLimit(`setup:${session.userId}:${network}`, 8);

    let jwt: string | undefined;
    if (renewGuest) {
      const response = await fetch(
        `${getNetworkConfig(network).apiOrigin}/auth/guest/start`,
        { method: "POST", cache: "no-store" },
      );
      if (!response.ok) {
        throw new Error(`TxLINE guest auth failed (${response.status})`);
      }
      const result = (await response.json()) as { token?: string };
      if (!result.token) throw new Error("TxLINE guest auth returned no token");
      jwt = result.token;
    }

    await resetCredentialForResubscribe({
      userId: session.userId,
      network,
      jwt,
    });
    clearLiveIdentityCache();
    return NextResponse.json({ state: "guest_created", network });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reset failed";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 400 },
    );
  }
}
