/** One user may keep several Expo tokens (one per device). Stored pipe-separated. */
export const PUSH_TOKEN_SEP = '|';
export const MAX_PUSH_TOKENS_PER_USER = 5;

export function parsePushTokens(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(PUSH_TOKEN_SEP)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Newest token first; drop duplicates; cap list length. */
export function mergePushToken(
  existing: string | null | undefined,
  next: string,
): string {
  const rest = parsePushTokens(existing).filter((t) => t !== next);
  return [next, ...rest]
    .slice(0, MAX_PUSH_TOKENS_PER_USER)
    .join(PUSH_TOKEN_SEP);
}

export function removePushToken(
  existing: string | null | undefined,
  dead: string,
): string | null {
  const next = parsePushTokens(existing).filter((t) => t !== dead);
  return next.length ? next.join(PUSH_TOKEN_SEP) : null;
}
