import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { getSourceStatus } from "@/lib/sources/manager";
import packageJson from "../../../package.json";

/** Judge-facing backup endpoint: proof the app is alive without needing the UI. */
export async function GET() {
  const [status, dbOk] = await Promise.all([getSourceStatus(), checkDb()]);

  return NextResponse.json({
    ok: true,
    mode: status.mode,
    lastPacketAt: status.lastPacketAt,
    packetsTotal: status.packetsTotal,
    liveTxlineConnected: status.liveTxlineConnected,
    edgesLive: status.edgesLive,
    mappedMarkets: status.mappedMarkets,
    dbOk,
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? packageJson.version,
    checkedAt: Date.now(),
  });
}

async function checkDb(): Promise<boolean> {
  try {
    await getDb().execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
