const KEY = 'pendingOrgInvite';

export type PendingInvite = {
  token: string;
  invitedByUserId?: string;
  /** roster = joinOrg (guild + esports seat); default guild-only. */
  seat?: 'guild' | 'roster';
};

export function savePendingInvite(
  token: string,
  invitedByUserId?: string,
  seat?: 'guild' | 'roster',
) {
  const cleaned = token.trim();
  if (!cleaned) return;
  const payload: PendingInvite = { token: cleaned };
  if (invitedByUserId?.trim()) {
    payload.invitedByUserId = invitedByUserId.trim();
  }
  if (seat === 'roster') payload.seat = 'roster';
  sessionStorage.setItem(KEY, JSON.stringify(payload));
}

export function peekPendingInvite(): PendingInvite | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingInvite | string;
    if (typeof parsed === 'string') {
      return { token: parsed };
    }
    if (parsed?.token) return parsed;
  } catch {
    // Legacy: plain token string.
    return { token: raw };
  }
  return null;
}

export function clearPendingInvite() {
  sessionStorage.removeItem(KEY);
}

export function inviteJoinPath(
  token: string,
  invitedByUserId?: string,
  seat?: 'guild' | 'roster',
) {
  const params = new URLSearchParams();
  if (seat === 'roster') params.set('seat', 'roster');
  if (invitedByUserId) params.set('ref', invitedByUserId);
  const qs = params.toString();
  const path = `/join/${encodeURIComponent(token.trim())}`;
  return qs ? `${path}?${qs}` : path;
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

/** Inviter user id from `?ref=` on an invite URL. */
export function extractInviteRef(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    if (trimmed.includes('://') || trimmed.startsWith('/join/') || trimmed.includes('?')) {
      const url = trimmed.includes('://')
        ? new URL(trimmed)
        : new URL(
            trimmed.startsWith('/') ? trimmed : `/?${trimmed.replace(/^\?/, '')}`,
            window.location.origin,
          );
      return url.searchParams.get('ref')?.trim() || undefined;
    }
  } catch {
    /* fall through */
  }
  const match = trimmed.match(/[?&]ref=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}
