import type { FixtureSummary } from "@/lib/txline/fixtures";

export type ScheduledFixture = {
  id: number;
  round: string;
  startTime: number;
  home: string;
  away: string;
  finalScore?: string;
};

/**
 * Fixed World Cup schedule with real TxLINE fixtureIds (from tx-on-chain docs).
 * Used to surface completed matches the live fixtures snapshot omits.
 */
export const WORLD_CUP_SCHEDULE: ScheduledFixture[] = [
  { id: 17588325, round: "Group Stage", startTime: Date.UTC(2026, 5, 28, 2, 0), home: "Jordan", away: "Argentina" },
  { id: 17588326, round: "Group Stage", startTime: Date.UTC(2026, 5, 28, 2, 0), home: "Algeria", away: "Austria" },
  { id: 18167317, round: "Round of 32", startTime: Date.UTC(2026, 5, 28, 19, 0), home: "South Africa", away: "Canada" },
  { id: 18172489, round: "Round of 32", startTime: Date.UTC(2026, 5, 29, 17, 0), home: "Brazil", away: "Japan" },
  { id: 18175983, round: "Round of 32", startTime: Date.UTC(2026, 5, 29, 20, 30), home: "Germany", away: "Paraguay" },
  { id: 18172260, round: "Round of 32", startTime: Date.UTC(2026, 5, 30, 1, 0), home: "Netherlands", away: "Morocco" },
  { id: 18175397, round: "Round of 32", startTime: Date.UTC(2026, 5, 30, 17, 0), home: "Ivory Coast", away: "Norway" },
  { id: 18175981, round: "Round of 32", startTime: Date.UTC(2026, 5, 30, 21, 0), home: "France", away: "Sweden" },
  { id: 18179759, round: "Round of 32", startTime: Date.UTC(2026, 6, 1, 1, 0), home: "Mexico", away: "Ecuador" },
  { id: 18179764, round: "Round of 32", startTime: Date.UTC(2026, 6, 1, 16, 0), home: "England", away: "Congo DR" },
  { id: 18179550, round: "Round of 32", startTime: Date.UTC(2026, 6, 1, 20, 0), home: "Belgium", away: "Senegal" },
  { id: 18172379, round: "Round of 32", startTime: Date.UTC(2026, 6, 2, 0, 0), home: "USA", away: "Bosnia & Herzegovina" },
  { id: 18179551, round: "Round of 32", startTime: Date.UTC(2026, 6, 2, 19, 0), home: "Spain", away: "Austria" },
  { id: 18179763, round: "Round of 32", startTime: Date.UTC(2026, 6, 2, 23, 0), home: "Portugal", away: "Croatia" },
  { id: 18179552, round: "Round of 32", startTime: Date.UTC(2026, 6, 3, 3, 0), home: "Switzerland", away: "Algeria" },
  { id: 18176123, round: "Round of 32", startTime: Date.UTC(2026, 6, 3, 18, 0), home: "Australia", away: "Egypt" },
  { id: 18175918, round: "Round of 32", startTime: Date.UTC(2026, 6, 3, 22, 0), home: "Argentina", away: "Cape Verde" },
  { id: 18179549, round: "Round of 32", startTime: Date.UTC(2026, 6, 4, 1, 30), home: "Colombia", away: "Ghana" },
  { id: 18185036, round: "8th Finals", startTime: Date.UTC(2026, 6, 4, 17, 0), home: "Canada", away: "Morocco" },
  { id: 18188721, round: "8th Finals", startTime: Date.UTC(2026, 6, 4, 21, 3), home: "Paraguay", away: "France" },
  { id: 18187298, round: "8th Finals", startTime: Date.UTC(2026, 6, 5, 20, 0), home: "Brazil", away: "Norway" },
  { id: 18192996, round: "8th Finals", startTime: Date.UTC(2026, 6, 6, 0, 0), home: "Mexico", away: "England" },
  { id: 18198205, round: "8th Finals", startTime: Date.UTC(2026, 6, 6, 19, 0), home: "Portugal", away: "Spain" },
  { id: 18193785, round: "8th Finals", startTime: Date.UTC(2026, 6, 7, 0, 0), home: "USA", away: "Belgium" },
  { id: 18202701, round: "8th Finals", startTime: Date.UTC(2026, 6, 7, 16, 0), home: "Argentina", away: "Egypt" },
  { id: 18202783, round: "8th Finals", startTime: Date.UTC(2026, 6, 7, 20, 0), home: "Switzerland", away: "Colombia" },
  { id: 18209181, round: "Quarter-finals", startTime: Date.UTC(2026, 6, 9, 20, 0), home: "France", away: "Morocco", finalScore: "2-0" },
  { id: 18218149, round: "Quarter-finals", startTime: Date.UTC(2026, 6, 10, 19, 0), home: "Spain", away: "Belgium", finalScore: "2-1" },
  { id: 18213979, round: "Quarter-finals", startTime: Date.UTC(2026, 6, 11, 21, 0), home: "Norway", away: "England", finalScore: "1-2" },
  { id: 18222446, round: "Quarter-finals", startTime: Date.UTC(2026, 6, 12, 1, 0), home: "Argentina", away: "Switzerland", finalScore: "3-1" },
  { id: 18237038, round: "Semi-finals", startTime: Date.UTC(2026, 6, 14, 19, 0), home: "France", away: "Spain" },
  { id: 18241006, round: "Semi-finals", startTime: Date.UTC(2026, 6, 15, 19, 0), home: "England", away: "Argentina" },
  { id: 18257865, round: "3rd Place Final", startTime: Date.UTC(2026, 6, 18, 21, 0), home: "France", away: "England" },
  { id: 18257739, round: "Final", startTime: Date.UTC(2026, 6, 19, 19, 0), home: "Spain", away: "Argentina" },
];

export function scheduledFixtureToSummary(scheduled: ScheduledFixture): FixtureSummary {
  const competition = `World Cup · ${scheduled.round}`;
  return {
    id: scheduled.id,
    label: `${scheduled.home} vs ${scheduled.away} · ${competition}`,
    competition,
    startTime: scheduled.startTime,
    gameState: null,
    raw: {
      FixtureId: scheduled.id,
      Participant1: scheduled.home,
      Participant2: scheduled.away,
      Competition: competition,
      StartTime: scheduled.startTime,
      ...(scheduled.finalScore ? { FinalScore: scheduled.finalScore } : {}),
    },
  };
}
