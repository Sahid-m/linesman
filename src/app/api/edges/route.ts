import { NextResponse } from "next/server";
import { getSourceEdges } from "@/lib/sources/manager";

export async function GET(request: Request) {
  const rawAt = new URL(request.url).searchParams.get("atMs");
  const atMs = rawAt != null ? Number(rawAt) : undefined;
  const { edges, status } = await getSourceEdges(
    typeof atMs === "number" && Number.isFinite(atMs) ? { atMs } : undefined,
  );
  return NextResponse.json({ edges, status, generatedAt: Date.now() });
}
