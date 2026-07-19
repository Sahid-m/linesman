import type { ClosedMarketRecord, Edge, GapPoint, Team } from "@/lib/types";
import { computeEdge } from "@/lib/engine/edge";
import { SHOWCASE_SEMI_IDS } from "@/lib/sources/showcase-ids";

export { SHOWCASE_SEMI_IDS, isShowcaseSemiFixture } from "@/lib/sources/showcase-ids";

/**
 * Fallback static tape if venue history fetch fails.
 */

const FRA: Team = {
  code: "FRA",
  name: "France",
  primaryColor: "#002395",
  secondaryColor: "#ED2939",
};
const ESP: Team = {
  code: "ESP",
  name: "Spain",
  primaryColor: "#AA151B",
  secondaryColor: "#F1BF00",
};
const ENG: Team = {
  code: "ENG",
  name: "England",
  primaryColor: "#FFFFFF",
  secondaryColor: "#CF081F",
};
const ARG: Team = {
  code: "ARG",
  name: "Argentina",
  primaryColor: "#6CACE4",
  secondaryColor: "#FCD116",
};

const KICKOFF_FS = Date.UTC(2026, 6, 14, 19, 0);
const KICKOFF_EA = Date.UTC(2026, 6, 15, 19, 0);
const PACKET_FS = KICKOFF_FS + 52 * 60_000; // ~52' — peak mispricing window
const PACKET_EA = KICKOFF_EA + 68 * 60_000;

function gapTrail(peakGapPct: number, points = 18): GapPoint[] {
  const now = PACKET_FS;
  const history: GapPoint[] = [];
  for (let i = 0; i < points; i++) {
    const t = now - (points - 1 - i) * 3 * 60_000;
    const progress = i / (points - 1);
    // Rises into the miss, then collapses after the market finally catches up.
    const envelope = Math.sin(progress * Math.PI);
    const wobble = Math.sin(progress * 9) * 0.8;
    history.push({ t, gapPct: Math.max(0, peakGapPct * envelope + wobble) });
  }
  return history;
}

function edge(input: {
  fixtureId: number;
  competition: string;
  home: Team;
  away: Team;
  selection: "part1" | "part2" | "draw";
  selectionLabel: string;
  fairProb: number;
  venue: "polymarket" | "kalshi";
  venueMarketId: string;
  question: string;
  yesPrice: number;
  liquidityUsd: number;
  kickoffTime: number;
  packetTimestamp: number;
  peakGapPct: number;
  venueUrl: string;
}): Edge {
  const outcomeId = `txl-${input.fixtureId}:1x2:${input.selection}`;
  const sharp = {
    outcomeId,
    fixtureId: `txl-${input.fixtureId}`,
    competition: input.competition,
    homeTeam: input.home,
    awayTeam: input.away,
    market: "1x2" as const,
    selectionLabel: input.selectionLabel,
    decimalOdds: 1 / input.fairProb,
    impliedProb: input.fairProb,
    fairProb: input.fairProb,
    packetTimestamp: input.packetTimestamp,
    proofRef: {
      network: "devnet" as const,
      epochDay: Math.floor(input.packetTimestamp / 86_400_000),
      merkleRoot: `showcase-${input.fixtureId}-${input.selection}`,
    },
    kickoffTime: input.kickoffTime,
    isLive: true,
  };
  const venue = {
    outcomeId,
    venue: input.venue,
    venueMarketId: input.venueMarketId,
    question: input.question,
    yesPrice: input.yesPrice,
    liquidityUsd: input.liquidityUsd,
    fetchedAt: input.packetTimestamp,
    venueUrl: input.venueUrl,
  };
  const built = computeEdge({
    sharp,
    venue,
    gapHistory: gapTrail(input.peakGapPct),
    mappingConfidence: "high",
    recentImpliedProbs: [input.fairProb - 0.01, input.fairProb, input.fairProb + 0.005],
  });
  return built;
}

/** All showcase semi edges, or one fixture if `fixtureId` is set. */
export function getShowcaseSemiEdges(fixtureId?: number): Edge[] {
  const franceSpain: Edge[] = [
    edge({
      fixtureId: SHOWCASE_SEMI_IDS.franceSpain,
      competition: "World Cup · Semi-finals",
      home: FRA,
      away: ESP,
      selection: "part1",
      selectionLabel: "France",
      fairProb: 0.48, // TxLINE demargined
      venue: "polymarket",
      venueMarketId: "showcase-pm-fra-esp-fra",
      question: "Will France win vs Spain (Semi-final)?",
      yesPrice: 0.39, // venue lagging — underpriced France
      liquidityUsd: 420_000,
      kickoffTime: KICKOFF_FS,
      packetTimestamp: PACKET_FS,
      peakGapPct: 14.2,
      venueUrl: "https://polymarket.com/event/fifwc-fra-esp",
    }),
    edge({
      fixtureId: SHOWCASE_SEMI_IDS.franceSpain,
      competition: "World Cup · Semi-finals",
      home: FRA,
      away: ESP,
      selection: "part2",
      selectionLabel: "Spain",
      fairProb: 0.31,
      venue: "kalshi",
      venueMarketId: "showcase-kx-fra-esp-esp",
      question: "Spain vs France Winner? · Spain",
      yesPrice: 0.41, // overpriced Spain
      liquidityUsd: 88_000,
      kickoffTime: KICKOFF_FS,
      packetTimestamp: PACKET_FS,
      peakGapPct: 11.5,
      venueUrl: "https://kalshi.com/markets/KXWCGAME",
    }),
    edge({
      fixtureId: SHOWCASE_SEMI_IDS.franceSpain,
      competition: "World Cup · Semi-finals",
      home: FRA,
      away: ESP,
      selection: "draw",
      selectionLabel: "Draw",
      fairProb: 0.21,
      venue: "polymarket",
      venueMarketId: "showcase-pm-fra-esp-draw",
      question: "Will France vs Spain end in a draw?",
      yesPrice: 0.28,
      liquidityUsd: 61_000,
      kickoffTime: KICKOFF_FS,
      packetTimestamp: PACKET_FS,
      peakGapPct: 8.4,
      venueUrl: "https://polymarket.com/event/fifwc-fra-esp",
    }),
  ];

  const englandArgentina: Edge[] = [
    edge({
      fixtureId: SHOWCASE_SEMI_IDS.englandArgentina,
      competition: "World Cup · Semi-finals",
      home: ENG,
      away: ARG,
      selection: "part2",
      selectionLabel: "Argentina",
      fairProb: 0.44,
      venue: "polymarket",
      venueMarketId: "showcase-pm-eng-arg-arg",
      question: "Will Argentina win vs England (Semi-final)?",
      yesPrice: 0.35, // missed Argentina underprice
      liquidityUsd: 510_000,
      kickoffTime: KICKOFF_EA,
      packetTimestamp: PACKET_EA,
      peakGapPct: 16.8,
      venueUrl: "https://polymarket.com/event/fifwc-eng-arg",
    }),
    edge({
      fixtureId: SHOWCASE_SEMI_IDS.englandArgentina,
      competition: "World Cup · Semi-finals",
      home: ENG,
      away: ARG,
      selection: "part1",
      selectionLabel: "England",
      fairProb: 0.33,
      venue: "kalshi",
      venueMarketId: "showcase-kx-eng-arg-eng",
      question: "England vs Argentina Winner? · England",
      yesPrice: 0.42,
      liquidityUsd: 120_000,
      kickoffTime: KICKOFF_EA,
      packetTimestamp: PACKET_EA,
      peakGapPct: 12.1,
      venueUrl: "https://kalshi.com/markets/KXWCGAME",
    }),
    edge({
      fixtureId: SHOWCASE_SEMI_IDS.englandArgentina,
      competition: "World Cup · Semi-finals",
      home: ENG,
      away: ARG,
      selection: "draw",
      selectionLabel: "Draw",
      fairProb: 0.23,
      venue: "polymarket",
      venueMarketId: "showcase-pm-eng-arg-draw",
      question: "Will England vs Argentina end in a draw?",
      yesPrice: 0.3,
      liquidityUsd: 74_000,
      kickoffTime: KICKOFF_EA,
      packetTimestamp: PACKET_EA,
      peakGapPct: 9.2,
      venueUrl: "https://polymarket.com/event/fifwc-eng-arg",
    }),
  ];

  const all = [...franceSpain, ...englandArgentina];
  if (fixtureId == null) return all;
  return all.filter((item) => item.sharp.fixtureId === `txl-${fixtureId}`);
}

/** Settlement audits telling the "venue was late / wrong" story for the two semis. */
export function getShowcaseSemiAudits(fixtureId?: number): ClosedMarketRecord[] {
  const fullTimeFs = KICKOFF_FS + 105 * 60_000;
  const fullTimeEa = KICKOFF_EA + 108 * 60_000;

  const records: ClosedMarketRecord[] = [
    {
      venueMarketId: "showcase-pm-fra-esp-fra",
      venue: "polymarket",
      question: "Will France win vs Spain (Semi-final)?",
      fixtureId: `txl-${SHOWCASE_SEMI_IDS.franceSpain}`,
      provenResult: "YES",
      venueResolution: "YES",
      resolvedAt: fullTimeFs + 18 * 60_000, // late
      fullTimeAt: fullTimeFs,
      proofRef: { network: "devnet", epochDay: Math.floor(fullTimeFs / 86_400_000) },
    },
    {
      venueMarketId: "showcase-kx-fra-esp-esp",
      venue: "kalshi",
      question: "Spain vs France Winner? · Spain",
      fixtureId: `txl-${SHOWCASE_SEMI_IDS.franceSpain}`,
      provenResult: "NO",
      venueResolution: "YES", // incorrect — still leaning Spain after FT
      resolvedAt: fullTimeFs + 6 * 60_000,
      fullTimeAt: fullTimeFs,
      proofRef: { network: "devnet", epochDay: Math.floor(fullTimeFs / 86_400_000) },
    },
    {
      venueMarketId: "showcase-pm-eng-arg-arg",
      venue: "polymarket",
      question: "Will Argentina win vs England (Semi-final)?",
      fixtureId: `txl-${SHOWCASE_SEMI_IDS.englandArgentina}`,
      provenResult: "YES",
      venueResolution: "YES",
      resolvedAt: fullTimeEa + 140 * 60_000, // very late
      fullTimeAt: fullTimeEa,
      proofRef: { network: "devnet", epochDay: Math.floor(fullTimeEa / 86_400_000) },
    },
    {
      venueMarketId: "showcase-kx-eng-arg-eng",
      venue: "kalshi",
      question: "England vs Argentina Winner? · England",
      fixtureId: `txl-${SHOWCASE_SEMI_IDS.englandArgentina}`,
      provenResult: "NO",
      venueResolution: "NO",
      resolvedAt: fullTimeEa + 12 * 60_000,
      fullTimeAt: fullTimeEa,
      proofRef: { network: "devnet", epochDay: Math.floor(fullTimeEa / 86_400_000) },
    },
  ];

  if (fixtureId == null) return records;
  return records.filter((record) => record.fixtureId === `txl-${fixtureId}`);
}
