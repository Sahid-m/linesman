import { NextResponse } from "next/server";
import { getSourceEdges, getSourceStatus } from "@/lib/sources/manager";

export async function GET(request: Request) {
  const rawAt = new URL(request.url).searchParams.get("atMs");
  const atMs = rawAt != null ? Number(rawAt) : undefined;
  if (typeof atMs === "number" && Number.isFinite(atMs)) {
    const { status } = await getSourceEdges({ atMs });
    return NextResponse.json({ status, checkedAt: Date.now() });
  }
  const status = await getSourceStatus();
  return NextResponse.json({ status, checkedAt: Date.now() });
}
