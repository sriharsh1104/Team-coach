import { useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';

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

// ── Already-handled links ───────────────────────────────────────────────
// Android keeps the ACTION_VIEW intent that launched the app, so
// getInitialURL() hands back the same /join/<token> on every later cold
// start — long after the user joined. Replaying it put an "You are already
// in a guild" toast on the screen at every single login. Remember which
// tokens have been seen so a re-delivered launch intent is ignored; a link
// the user taps while the app is running is always honoured.
const HANDLED_FILE = 'team-coach.invite-handled.json';
const HANDLED_KEY = 'team-coach.inviteHandled';
/** Plenty for one device, and bounded so the file cannot grow forever. */
const HANDLED_LIMIT = 50;

let handled: string[] = [];
let handledLoaded = false;

function storageKey(invite: PendingInvite): string {
  return `${invite.seat}:${invite.token}`;
}

async function readHandled(): Promise<string[]> {
  try {
    if (Platform.OS === 'web') {
      const raw = localStorage.getItem(HANDLED_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FileSystem = require('expo-file-system') as typeof import('expo-file-system');
    const path = `${FileSystem.documentDirectory}${HANDLED_FILE}`;
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return [];
    return JSON.parse(await FileSystem.readAsStringAsync(path)) as string[];
  } catch {
    return [];
  }
}

async function writeHandled(next: string[]) {
  try {
    const body = JSON.stringify(next);
    if (Platform.OS === 'web') {
      localStorage.setItem(HANDLED_KEY, body);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FileSystem = require('expo-file-system') as typeof import('expo-file-system');
    await FileSystem.writeAsStringAsync(
      `${FileSystem.documentDirectory}${HANDLED_FILE}`,
      body,
    );
  } catch {
    // Private browsing / disk full — worst case the toast comes back once.
  }
}

export function markInviteHandled(invite: PendingInvite) {
  const key = storageKey(invite);
  if (handled.includes(key)) return;
  handled = [...handled, key].slice(-HANDLED_LIMIT);
  void writeHandled(handled);
}

export function isInviteHandled(invite: PendingInvite): boolean {
  return handled.includes(storageKey(invite));
}

/** Test seam — reset the in-memory record between cases. */
export function resetHandledInvites() {
  handled = [];
  handledLoaded = false;
}

function handleIncomingUrl(url: string | null | undefined) {
  const invite = parseInviteLink(url);
  if (!invite) return;
  // The user just tapped this link — act on it even if it was used before,
  // so "join again" / a re-shared link still works.
  markInviteHandled(invite);
  setPendingInvite(invite);
}

/**
 * The URL the app was launched with. Unlike a tapped link this can be a
 * months-old intent Android is replaying, so it only counts the first time.
 */
function handleLaunchUrl(url: string | null | undefined) {
  const invite = parseInviteLink(url);
  if (!invite || isInviteHandled(invite)) return;
  markInviteHandled(invite);
  setPendingInvite(invite);
}

let installed = false;
/** Idempotent: cold-start URL + links received while the app is running. */
export function installInviteLinkListener() {
  if (installed) return;
  installed = true;
  try {
    Linking.addEventListener('url', ({ url }) => handleIncomingUrl(url));
    const launch = () =>
      Linking.getInitialURL()?.then(handleLaunchUrl).catch(() => undefined);
    if (handledLoaded) {
      void launch();
      return;
    }
    // Read the record first: acting on the launch URL before we know what
    // has already been seen is exactly the replay we are preventing.
    void readHandled()
      .then((stored) => {
        handled = stored;
      })
      .catch(() => undefined)
      .finally(() => {
        handledLoaded = true;
        void launch();
      });
  } catch {
    // Linking unavailable (tests / web) — pasting a link still works.
  }
}
