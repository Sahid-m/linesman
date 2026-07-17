import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { getNetworkConfig } from "@/lib/network/config";
import { upsertCredentialState } from "@/lib/txline/credentials";

const requestSchema = z.object({
  network: z.enum(["devnet", "mainnet"]),
});

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const { network } = requestSchema.parse(await request.json());
    const response = await fetch(
      `${getNetworkConfig(network).apiOrigin}/auth/guest/start`,
      { method: "POST", cache: "no-store" },
    );
    if (!response.ok) throw new Error(`TxLINE guest auth failed (${response.status})`);
    const result = (await response.json()) as { token?: string };
    if (!result.token) throw new Error("TxLINE guest auth returned no token");
    await upsertCredentialState({
      userId: session.userId,
      network,
      jwt: result.token,
      setupState: "guest_created",
    });
    return NextResponse.json({ state: "guest_created", network });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Setup failed";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 400 },
    );
  }
}
