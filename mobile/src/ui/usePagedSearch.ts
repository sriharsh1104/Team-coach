import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDebouncedValue } from './useDebouncedValue';

const DEFAULT_PAGE = 25;
const DEFAULT_DEBOUNCE_MS = 300;

/**
 * Client-side search + page slices for member / guild / roster lists.
 * Keeps the full source in memory (orgs aren't huge) and only renders a page.
 */
export function usePagedSearch<T>({
  items,
  match,
  pageSize = DEFAULT_PAGE,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: {
  items: T[];
  match: (item: T, query: string) => boolean;
  pageSize?: number;
  debounceMs?: number;
}) {
  const [draft, setDraft] = useState('');
  const query = useDebouncedValue(draft.trim().toLowerCase(), debounceMs);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [query, items]);

  const filtered = useMemo(() => {
    if (!query) return items;
    return items.filter((item) => match(item, query));
  }, [items, query, match]);

  const visibleCount = Math.min(page * pageSize, filtered.length);
  const visible = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );
  const hasMore = visibleCount < filtered.length;

  const loadMore = useCallback(() => {
    setPage((p) => p + 1);
  }, []);

  const clear = useCallback(() => {
    setDraft('');
    setPage(1);
  }, []);

  return {
    draft,
    setDraft,
    query,
    filtered,
    visible,
    hasMore,
    loadMore,
    clear,
    total: filtered.length,
  };
}

/** Name / email / IGN match used across member lists. */
export function matchesPersonQuery(
  query: string,
  fields: {
    name?: string | null;
    email?: string | null;
    inGameName?: string | null;
  },
): boolean {
  if (!query) return true;
  const hay = [fields.name, fields.email, fields.inGameName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(query);
}
