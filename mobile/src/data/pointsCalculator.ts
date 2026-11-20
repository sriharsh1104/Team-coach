import { ELIMINATION_POINTS, PLACEMENT_POINTS } from './pointsTable';

/** One match the player wants to score: where the team finished + eliminations. */
export type CalcMatch = {
  /** 1-based finishing rank; null until the player picks one. */
  rank: number | null;
  kills: number;
};

/** One independent points table (a series): its own matches and its own total. */
export type CalcTable = { id: string; matches: CalcMatch[] };

export const MAX_CALC_MATCHES = 12;
export const MAX_CALC_TABLES = 10;
export const MAX_KILLS_PER_MATCH = 60;
export const MAX_RANK = PLACEMENT_POINTS.length;

export function newMatch(): CalcMatch {
  return { rank: null, kills: 0 };
}

export function newTable(): CalcTable {
  return {
    id: `t:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
    matches: [newMatch()],
  };
}

export function placementPointsFor(rank: number | null): number {
  if (rank == null) return 0;
  return PLACEMENT_POINTS.find((row) => row.rank === rank)?.points ?? 0;
}

export function matchPoints(match: CalcMatch) {
  const placement = placementPointsFor(match.rank);
  const kills = Math.max(0, Math.trunc(match.kills || 0)) * ELIMINATION_POINTS;
  return { placement, kills, total: placement + kills };
}

export function seriesTotals(matches: CalcMatch[]) {
  let placement = 0;
  let kills = 0;
  let booyahs = 0;
  let killCount = 0;
  for (const m of matches) {
    const p = matchPoints(m);
    placement += p.placement;
    kills += p.kills;
    killCount += Math.max(0, Math.trunc(m.kills || 0));
    if (m.rank === 1) booyahs += 1;
  }
  return { total: placement + kills, placement, kills, killCount, booyahs };
}

export function rankLabel(rank: number | null): string {
  if (rank == null) return '—';
  return PLACEMENT_POINTS.find((row) => row.rank === rank)?.label.split(' ')[0] ?? `${rank}th`;
}

/** Chat-ready summary, e.g. "Match 1: 3rd · 5 kills = 13 pts". */
export function formatSummary(matches: CalcMatch[], title = 'Points'): string {
  const scored = matches.filter((m) => m.rank != null);
  if (scored.length === 0) return '';
  const lines = scored.map((m, i) => {
    const p = matchPoints(m);
    const kills = `${m.kills} kill${m.kills === 1 ? '' : 's'}`;
    return `Match ${i + 1}: ${rankLabel(m.rank)} · ${kills} = ${p.total} pts`;
  });
  const t = seriesTotals(scored);
  return [`🏆 ${title} (${scored.length} match${scored.length === 1 ? '' : 'es'})`, ...lines, `Total: ${t.total} pts`].join('\n');
}

/** A points table recovered from a message that `formatSummary` posted to the chat. */
export type ParsedSummary = { title: string; matches: CalcMatch[] };

/**
 * Reads a chat message back into a table, so the next match can be added from
 * the chat itself. Returns null for anything that is not a points summary.
 */
export function parsePointsSummary(text: string | null | undefined): ParsedSummary | null {
  if (!text) return null;
  const lines = text.split('\n').map((l) => l.trim());
  const head = lines[0]?.match(/^🏆 (.+?) \(\d+ matches?\)$/);
  if (!head) return null;
  const matches: CalcMatch[] = [];
  for (const line of lines.slice(1)) {
    const m = line.match(/^Match \d+: (\S+) · (\d+) kills? = \d+ pts$/);
    if (!m) continue;
    const rank = Array.from({ length: MAX_RANK }, (_, i) => i + 1).find(
      (r) => rankLabel(r) === m[1],
    );
    if (!rank) return null;
    matches.push({ rank, kills: Math.min(MAX_KILLS_PER_MATCH, Number(m[2])) });
  }
  return matches.length ? { title: head[1], matches: matches.slice(0, MAX_CALC_MATCHES) } : null;
}
