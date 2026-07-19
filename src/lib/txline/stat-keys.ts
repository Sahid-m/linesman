/**
 * Full-game soccer stat key encoding, from
 * https://github.com/txodds/tx-on-chain/blob/main/documentation/scores/soccer-feed.mdx
 * Period-prefixed variants (H1/HT/H2/ET/penalties) add 1000/2000/3000/…
 * to these base keys; only full-game keys are exposed here.
 */
export const SOCCER_STAT_KEY_LABELS: Record<number, string> = {
  1: "Home goals",
  2: "Away goals",
  3: "Home yellow cards",
  4: "Away yellow cards",
  5: "Home red cards",
  6: "Away red cards",
  7: "Home corners",
  8: "Away corners",
};

export function statKeyLabel(key: number): string {
  return SOCCER_STAT_KEY_LABELS[key] ?? `Stat ${key}`;
}
