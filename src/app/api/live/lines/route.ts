import { NextResponse } from "next/server";
import { getSourceSharpLines } from "@/lib/sources/manager";

/** Real TxLINE sharp lines for the current session (or empty when not activated). */
export async function GET() {
  const { lines, status } = await getSourceSharpLines();
  return NextResponse.json({ lines, status, generatedAt: Date.now() });
}
