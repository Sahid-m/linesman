import { NextResponse } from "next/server";
import { z } from "zod";

import { FOCUS_COOKIE_NAME } from "@/lib/focus/fixture";

const focusSchema = z.object({
  id: z.number().int().nonnegative(),
  label: z.string().min(1),
  home: z.string().min(1),
  away: z.string().min(1),
  competition: z.string().optional(),
  finalScore: z.string().optional(),
  showcaseSemis: z.boolean().optional(),
  atMs: z.number().int().positive().optional(),
});

export async function GET() {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const raw = store.get(FOCUS_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ focus: null });
  try {
    return NextResponse.json({ focus: JSON.parse(raw) });
  } catch {
    return NextResponse.json({ focus: null });
  }
}

/** Pin a previous TxLINE fixture so Feed/Watchdog prefer it over the live catalogue. */
export async function POST(request: Request) {
  try {
    const focus = focusSchema.parse(await request.json());
    const response = NextResponse.json({ focus });
    response.cookies.set({
      name: FOCUS_COOKIE_NAME,
      value: JSON.stringify(focus),
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid focus fixture" },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ focus: null });
  response.cookies.set({
    name: FOCUS_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
