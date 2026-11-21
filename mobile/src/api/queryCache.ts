import { Platform } from 'react-native';

type CacheEntry<T> = { value: T; at: number };

const store = new Map<string, CacheEntry<unknown>>();

/** Keys worth keeping across process death so reopen paints instantly. */
const PERSIST_PREFIXES = [
  'chat:inbox',
  'org:detail',
  'org:members',
  'media:list:',
  'scrims:list',
] as const;

const DISK_FILE = 'team-coach.query-cache.json';
const MAX_DISK_ENTRIES = 40;
let hydrateStarted = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function shouldPersist(key: string): boolean {
  return PERSIST_PREFIXES.some(
    (p) => key === p || (p.endsWith(':') ? key.startsWith(p) : key === p),
  );
}

async function diskRead(): Promise<Record<string, CacheEntry<unknown>>> {
  try {
    if (Platform.OS === 'web') {
      const raw = localStorage.getItem(DISK_FILE);
      if (!raw) return {};
      return JSON.parse(raw) as Record<string, CacheEntry<unknown>>;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FileSystem = require('expo-file-system') as typeof import('expo-file-system');
    const path = `${FileSystem.documentDirectory}${DISK_FILE}`;
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return {};
    const raw = await FileSystem.readAsStringAsync(path);
    return JSON.parse(raw) as Record<string, CacheEntry<unknown>>;
  } catch {
    return {};
  }
}

async function diskWrite(payload: Record<string, CacheEntry<unknown>>) {
  try {
    const body = JSON.stringify(payload);
    if (Platform.OS === 'web') {
      localStorage.setItem(DISK_FILE, body);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FileSystem = require('expo-file-system') as typeof import('expo-file-system');
    const path = `${FileSystem.documentDirectory}${DISK_FILE}`;
    await FileSystem.writeAsStringAsync(path, body);
  } catch {
    /* disk full / private mode — RAM cache still works */
  }
}

function schedulePersist() {
  // Jest / NODE_ENV=test: keep RAM only — disk timers outlive the suite.
  if (
    typeof jest !== 'undefined' ||
    process.env.NODE_ENV === 'test' ||
    Platform.OS === 'web' && typeof localStorage === 'undefined'
  ) {
    return;
  }
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const payload: Record<string, CacheEntry<unknown>> = {};
    const entries = [...store.entries()]
      .filter(([k]) => shouldPersist(k))
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, MAX_DISK_ENTRIES);
    for (const [k, v] of entries) payload[k] = v;
    void diskWrite(payload);
  }, 400);
}

/**
 * Pull durable cache into memory once on boot. Safe to call multiple times.
 * Screens that mount before this finishes still fall through to network.
 */
export function hydrateQueryCache(): Promise<void> {
  if (hydrateStarted) return Promise.resolve();
  hydrateStarted = true;
  return diskRead().then((disk) => {
    for (const [key, entry] of Object.entries(disk)) {
      if (!entry || typeof entry.at !== 'number') continue;
      if (store.has(key)) continue; // live write wins
      store.set(key, entry);
    }
  });
}

/** In-memory response cache keyed like a URL (`stats:board:BR`). */
export function cacheGet<T>(key: string): T | undefined {
  const hit = store.get(key);
  return hit ? (hit.value as T) : undefined;
}

export function cacheSet<T>(key: string, value: T) {
  store.set(key, { value, at: Date.now() });
  if (shouldPersist(key)) schedulePersist();
}

export function cacheHas(key: string): boolean {
  return store.has(key);
}

export function cacheInvalidate(prefix?: string) {
  if (!prefix) {
    store.clear();
    schedulePersist();
    return;
  }
  for (const key of [...store.keys()]) {
    if (key === prefix || key.startsWith(prefix)) store.delete(key);
  }
  schedulePersist();
}

/**
 * Stale-while-revalidate: hand the caller whatever is cached so the screen
 * paints immediately, then always refetch and hand over the fresh value.
 *
 * `apply` runs at most twice — once from cache, once from the network — and
 * the second call is skipped when the payload is byte-identical, so a
 * background refresh that changed nothing doesn't re-render the list.
 *
 * Callers that need a loading state should branch on the `cache` source:
 * no cache hit means the first `apply` will be the network one.
 */
export async function revalidate<T>(
  key: string,
  fetcher: () => Promise<T>,
  apply: (value: T, source: 'cache' | 'network') => void,
  opts?: { force?: boolean },
): Promise<void> {
  let served: string | undefined;
  if (!opts?.force) {
    const cached = cacheGet<T>(key);
    if (cached !== undefined) {
      served = safeStringify(cached);
      apply(cached, 'cache');
    }
  }
  const fresh = await fetcher();
  cacheSet(key, fresh);
  if (served !== undefined && served === safeStringify(fresh)) return;
  apply(fresh, 'network');
}

/** Cheap change detection — cyclic payloads just count as "changed". */
function safeStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

/** True when `key` can be served from cache — i.e. no skeleton needed. */
export function hasFreshEnough(key: string, maxAgeMs?: number): boolean {
  const hit = store.get(key);
  if (!hit) return false;
  if (maxAgeMs == null) return true;
  return Date.now() - hit.at <= maxAgeMs;
}

export const CacheKeys = {
  statsBoard: (mode: string) => `stats:board:${mode}`,
  statsHistory: (mode: string) => `stats:history:${mode}`,
  statsExtractions: (mode: string) => `stats:extractions:${mode}`,
  mediaList: (uploaderId?: string | null) =>
    `media:list:${uploaderId ?? 'all'}`,
  scrimsList: () => 'scrims:list',
  chatInbox: () => 'chat:inbox',
  orgDetail: () => 'org:detail',
  orgMembers: () => 'org:members',
} as const;
