import "server-only";

import { cookies } from "next/headers";

export const FOCUS_COOKIE_NAME = "linesman_focus_fixture";

export type FocusFixture = {
  id: number;
  label: string;
  home: string;
  away: string;
  competition?: string;
  finalScore?: string;
  /** When true, Feed/Watchdog pull real Polymarket/Kalshi history for both semis. */
  showcaseSemis?: boolean;
  /** Simulation cursor — sample 1m venue candles as-of this unix ms. */
  atMs?: number;
};

export function parseFocusFixture(raw: string | undefined): FocusFixture | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<FocusFixture>;
    if (
      typeof value.id !== "number" ||
      !Number.isFinite(value.id) ||
      typeof value.label !== "string" ||
      typeof value.home !== "string" ||
      typeof value.away !== "string"
    ) {
      return null;
    }
    return {
      id: value.id,
      label: value.label,
      home: value.home,
      away: value.away,
      competition: typeof value.competition === "string" ? value.competition : undefined,
      finalScore: typeof value.finalScore === "string" ? value.finalScore : undefined,
      showcaseSemis: value.showcaseSemis === true,
      atMs: typeof value.atMs === "number" && Number.isFinite(value.atMs) ? value.atMs : undefined,
    };
  } catch {
    return null;
  }
}

export async function getFocusFixture(): Promise<FocusFixture | null> {
  try {
    const store = await cookies();
    return parseFocusFixture(store.get(FOCUS_COOKIE_NAME)?.value);
  } catch {
    return null;
  }
}
