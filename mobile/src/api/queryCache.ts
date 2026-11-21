type CacheEntry<T> = { value: T; at: number };

const store = new Map<string, CacheEntry<unknown>>();

/** In-memory response cache keyed like a URL (`stats:board:BR`). */
export function cacheGet<T>(key: string): T | undefined {
  const hit = store.get(key);
  return hit ? (hit.value as T) : undefined;
}

export function cacheSet<T>(key: string, value: T) {
  store.set(key, { value, at: Date.now() });
}

export function cacheHas(key: string): boolean {
  return store.has(key);
}

export function cacheInvalidate(prefix?: string) {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of [...store.keys()]) {
    if (key === prefix || key.startsWith(prefix)) store.delete(key);
  }
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
