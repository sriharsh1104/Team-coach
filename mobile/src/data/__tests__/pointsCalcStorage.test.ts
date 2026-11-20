import { sanitizeTables } from '../pointsCalcStorage';

describe('sanitizeTables', () => {
  it('falls back to one empty table for garbage', () => {
    const out = sanitizeTables('nope');
    expect(out).toHaveLength(1);
    expect(out[0].matches).toEqual([{ rank: null, kills: 0 }]);
  });

  it('clamps bad ranks/kills and keeps tables separate', () => {
    const out = sanitizeTables([
      { id: 'a', matches: [{ rank: 3, kills: 5 }, { rank: 99, kills: -4 }] },
      { id: 'b', matches: [{ rank: 1, kills: 2 }] },
    ]);
    expect(out.map((t) => t.id)).toEqual(['a', 'b']);
    expect(out[0].matches).toEqual([
      { rank: 3, kills: 5 },
      { rank: null, kills: 0 },
    ]);
    expect(out[1].matches).toEqual([{ rank: 1, kills: 2 }]);
  });
});
