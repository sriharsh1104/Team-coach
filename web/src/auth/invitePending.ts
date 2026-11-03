const KEY = 'pendingOrgInvite';

export function savePendingInvite(token: string) {
  const cleaned = token.trim();
  if (!cleaned) return;
  sessionStorage.setItem(KEY, cleaned);
}

export function peekPendingInvite(): string | null {
  return sessionStorage.getItem(KEY);
}

export function clearPendingInvite() {
  sessionStorage.removeItem(KEY);
}

export function inviteJoinPath(token: string) {
  return `/join/${encodeURIComponent(token.trim())}`;
}

/** Pull the raw referral token out of a path segment or pasted URL. */
export function extractInviteToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    if (trimmed.includes('://') || trimmed.startsWith('/join/')) {
      const url = trimmed.includes('://')
        ? new URL(trimmed)
        : new URL(trimmed, window.location.origin);
      const parts = url.pathname.split('/').filter(Boolean);
      const joinIdx = parts.indexOf('join');
      if (joinIdx >= 0 && parts[joinIdx + 1]) {
        return decodeURIComponent(parts[joinIdx + 1]);
      }
      return url.searchParams.get('token')?.trim() || trimmed;
    }
  } catch {
    /* fall through */
  }
  const match = trimmed.match(/(?:^|\/)join\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : trimmed;
}
