/** Shared fixture ids for World Cup semis with known Polymarket/Kalshi books. */
export const SHOWCASE_SEMI_IDS = {
  franceSpain: 18237038,
  englandArgentina: 18241006,
} as const;

export function isShowcaseSemiFixture(id: number): boolean {
  return id === SHOWCASE_SEMI_IDS.franceSpain || id === SHOWCASE_SEMI_IDS.englandArgentina;
}
