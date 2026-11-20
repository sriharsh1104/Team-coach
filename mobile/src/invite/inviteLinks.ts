import { useEffect, useState } from 'react';
import { Linking } from 'react-native';

/**
 * Roster / guild invite links.
 *
 * The shared link is `https://<web>/join/<token>?seat=roster&ref=<userId>`.
 * On Android the web page bounces into the app with
 * `teamcoach://join/<token>?seat=roster&ref=<userId>`. We understand both.
 */
export type PendingInvite = {
  token: string;
  seat: 'guild' | 'roster';
  ref?: string;
};

const SCHEME_RE = /^teamcoach:\/\/join\/([^/?#]+)(?:\?([^#]*))?/i;
const WEB_RE = /^https?:\/\/[^/]+\/join\/([^/?#]+)(?:\?([^#]*))?/i;

export function parseInviteLink(url: string | null | undefined): PendingInvite | null {
  if (!url) return null;
  const m = url.trim().match(SCHEME_RE) ?? url.trim().match(WEB_RE);
  if (!m?.[1]) return null;
  let token: string;
  try {
    token = decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  if (!token) return null;
  const query = new URLSearchParams(m[2] ?? '');
  const ref = query.get('ref')?.trim() || undefined;
  return { token, seat: query.get('seat') === 'roster' ? 'roster' : 'guild', ref };
}

/**
 * The text JoinOrgScreen / the backend understand (`normalizeReferralToken`,
 * `seat=roster`, `ref=`), built from a parsed link.
 */
export function inviteToJoinInput(invite: PendingInvite): string {
  const qs = new URLSearchParams();
  if (invite.seat === 'roster') qs.set('seat', 'roster');
  if (invite.ref) qs.set('ref', invite.ref);
  const query = qs.toString();
  return `/join/${encodeURIComponent(invite.token)}${query ? `?${query}` : ''}`;
}

// ── Pending-invite store ────────────────────────────────────────────────
// A link can arrive while nobody can act on it (signed out, filling the
// profile…). Keep it until a screen that can join consumes it.
let pending: PendingInvite | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function setPendingInvite(invite: PendingInvite | null) {
  pending = invite;
  emit();
}

export function peekPendingInvite(): PendingInvite | null {
  return pending;
}

export function takePendingInvite(): PendingInvite | null {
  const current = pending;
  pending = null;
  if (current) emit();
  return current;
}

export function usePendingInvite(): PendingInvite | null {
  const [value, setValue] = useState<PendingInvite | null>(pending);
  useEffect(() => {
    const sync = () => setValue(pending);
    listeners.add(sync);
    sync();
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return value;
}

function handleIncomingUrl(url: string | null | undefined) {
  const invite = parseInviteLink(url);
  if (invite) setPendingInvite(invite);
}

let installed = false;
/** Idempotent: cold-start URL + links received while the app is running. */
export function installInviteLinkListener() {
  if (installed) return;
  installed = true;
  try {
    Linking.addEventListener('url', ({ url }) => handleIncomingUrl(url));
    void Linking.getInitialURL()?.then(handleIncomingUrl).catch(() => undefined);
  } catch {
    // Linking unavailable (tests / web) — pasting a link still works.
  }
}
