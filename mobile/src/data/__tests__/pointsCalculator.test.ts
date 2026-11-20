import {
  formatSummary,
  matchPoints,
  parsePointsSummary,
  placementPointsFor,
  seriesTotals,
} from '../pointsCalculator';

describe('points calculator (official Points Table)', () => {
  it('maps placement to table points and treats unknown/no rank as 0', () => {
    expect(placementPointsFor(1)).toBe(12);
    expect(placementPointsFor(2)).toBe(9);
    expect(placementPointsFor(10)).toBe(1);
    expect(placementPointsFor(12)).toBe(0);
    expect(placementPointsFor(null)).toBe(0);
  });

  it('match total = placement + kills x 1', () => {
    expect(matchPoints({ rank: 3, kills: 5 })).toEqual({ placement: 8, kills: 5, total: 13 });
    expect(matchPoints({ rank: 1, kills: 0 }).total).toBe(12);
  });

  it('sums a series and counts Booyahs', () => {
    const t = seriesTotals([
      { rank: 1, kills: 7 }, // 19
      { rank: 3, kills: 5 }, // 13
      { rank: 12, kills: 2 }, // 2
    ]);
    expect(t).toMatchObject({ total: 34, placement: 20, kills: 14, booyahs: 1, killCount: 14 });
  });

  it('formats a chat summary and skips matches without a placement', () => {
    const text = formatSummary([
      { rank: 3, kills: 5 },
      { rank: null, kills: 9 },
      { rank: 1, kills: 1 },
    ]);
    expect(text).toContain('Match 1: 3rd · 5 kills = 13 pts');
    expect(text).toContain('Match 2: 1st · 1 kill = 13 pts');
    expect(text).toContain('Total: 26 pts');
    expect(formatSummary([{ rank: null, kills: 0 }])).toBe('');
  });
});

describe('parsePointsSummary', () => {
  it('round-trips a posted summary so more matches can be added from chat', () => {
    const matches = [
      { rank: 3, kills: 5 },
      { rank: 1, kills: 1 },
    ];
    const parsed = parsePointsSummary(formatSummary(matches, 'Scrim A'));
    expect(parsed).toEqual({ title: 'Scrim A', matches });
  });

  it('returns null for normal chat text', () => {
    expect(parsePointsSummary('hello team')).toBeNull();
    expect(parsePointsSummary(null)).toBeNull();
  });
});
