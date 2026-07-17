import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { getCredential } from "@/lib/txline/credentials";

const querySchema = z.object({
  network: z.enum(["devnet", "mainnet"]),
});

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const { network } = querySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const credential = await getCredential(session.userId, network);
    return NextResponse.json(
      credential
        ? {
            state: credential.setupState,
            network,
            serviceLevelId: credential.serviceLevelId,
            txSignature: credential.subscriptionTxSignature,
          }
        : { state: null, network },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Status failed";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 400 },
    );
  }
}
