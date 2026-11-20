import { Platform } from 'react-native';
import {
  CalcMatch,
  CalcTable,
  MAX_CALC_MATCHES,
  MAX_CALC_TABLES,
  MAX_KILLS_PER_MATCH,
  MAX_RANK,
  newMatch,
  newTable,
} from './pointsCalculator';

const KEY = 'team-coach.pointsCalc.v2';
/** v1 stored a single flat list of matches — migrated into one table. */
const LEGACY_KEY = 'team-coach.pointsCalc.v1';

function nativeSecureStore() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-secure-store') as typeof import('expo-secure-store');
}

async function readKey(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return localStorage.getItem(key);
  return nativeSecureStore().getItemAsync(key);
}

function sanitizeMatches(raw: unknown): CalcMatch[] {
  if (!Array.isArray(raw)) return [newMatch()];
  const out: CalcMatch[] = [];
  for (const item of raw.slice(0, MAX_CALC_MATCHES)) {
    const rank = Number((item as CalcMatch)?.rank);
    const kills = Number((item as CalcMatch)?.kills);
    out.push({
      rank: Number.isInteger(rank) && rank >= 1 && rank <= MAX_RANK ? rank : null,
      kills: Number.isFinite(kills) ? Math.min(MAX_KILLS_PER_MATCH, Math.max(0, Math.trunc(kills))) : 0,
    });
  }
  return out.length ? out : [newMatch()];
}

export function sanitizeTables(raw: unknown): CalcTable[] {
  if (!Array.isArray(raw)) return [newTable()];
  const out: CalcTable[] = [];
  for (const item of raw.slice(0, MAX_CALC_TABLES)) {
    const t = item as Partial<CalcTable>;
    out.push({
      id: typeof t?.id === 'string' && t.id ? t.id : newTable().id,
      matches: sanitizeMatches(t?.matches),
    });
  }
  return out.length ? out : [newTable()];
}

/** Saved tables survive closing the sheet, so a match can be added to a table later. */
export async function loadCalcTables(): Promise<CalcTable[]> {
  try {
    const raw = await readKey(KEY);
    if (raw) return sanitizeTables(JSON.parse(raw));
    const legacy = await readKey(LEGACY_KEY);
    if (legacy) return [{ ...newTable(), matches: sanitizeMatches(JSON.parse(legacy)) }];
  } catch {
    // fall through to a fresh table
  }
  return [newTable()];
}

export async function saveCalcTables(tables: CalcTable[]): Promise<void> {
  try {
    const value = JSON.stringify(tables);
    if (Platform.OS === 'web') localStorage.setItem(KEY, value);
    else await nativeSecureStore().setItemAsync(KEY, value);
  } catch {
    // Best-effort persistence only.
  }
}
