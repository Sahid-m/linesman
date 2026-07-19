/** A single venue's current implied win probability for one side of a fixture. */
export type VenuePrice = {
  venue: "polymarket" | "sxbet" | "kalshi" | "txodds";
  bookmaker?: string;
  homeImpliedPct: number | null;
  awayImpliedPct: number | null;
  drawImpliedPct: number | null;
  observedAt: number;
  raw: Record<string, unknown>;
};

export type TeamNames = { home: string; away: string };

const COMBINING_DIACRITICS = /[̀-ͯ]/g;
const NON_LETTERS = /[^a-z]/g;

/** Loose match: venues spell team names slightly differently ("USA" vs "United States"). */
export function namesLooselyMatch(a: string, b: string): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(COMBINING_DIACRITICS, "")
      .replace(NON_LETTERS, "");
  const na = normalize(a);
  const nb = normalize(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}
