export type PlacementRow = {
  rank: number;
  label: string;
  points: number;
};

/** FFWS Battle Royale placement points (official scoring). */
export const PLACEMENT_POINTS: PlacementRow[] = [
  { rank: 1, label: '1st (Booyah)', points: 12 },
  { rank: 2, label: '2nd', points: 9 },
  { rank: 3, label: '3rd', points: 8 },
  { rank: 4, label: '4th', points: 7 },
  { rank: 5, label: '5th', points: 6 },
  { rank: 6, label: '6th', points: 5 },
  { rank: 7, label: '7th', points: 4 },
  { rank: 8, label: '8th', points: 3 },
  { rank: 9, label: '9th', points: 2 },
  { rank: 10, label: '10th', points: 1 },
  { rank: 11, label: '11th', points: 0 },
  { rank: 12, label: '12th', points: 0 },
];

export const ELIMINATION_POINTS = 1;

export const TIEBREAKERS: Array<{ order: number; rule: string }> = [
  { order: 1, rule: 'Higher Booyah count' },
  { order: 2, rule: 'Higher total eliminations in the series' },
  { order: 3, rule: 'Better placement in the last match of the series' },
];

export function matchPoints(placementRank: number, eliminations: number): number {
  const row = PLACEMENT_POINTS.find((r) => r.rank === placementRank);
  const placement = row?.points ?? 0;
  return placement + eliminations * ELIMINATION_POINTS;
}
