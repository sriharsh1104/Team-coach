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

export const CacheKeys = {
  statsBoard: (mode: string) => `stats:board:${mode}`,
  statsHistory: (mode: string) => `stats:history:${mode}`,
  statsExtractions: (mode: string) => `stats:extractions:${mode}`,
  mediaList: (uploaderId?: string | null) =>
    `media:list:${uploaderId ?? 'all'}`,
  scrimsList: () => 'scrims:list',
} as const;
