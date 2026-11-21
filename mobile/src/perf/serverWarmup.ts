import { apiBaseUrl } from '../api/client';
import { isOnline } from '../net/networkStatus';

/**
 * Cold-start warm-up for the backend.
 *
 * The free tier spins the server down after idle time, and waking it can
 * take the better part of a minute. `useServerWakePing` only kept it warm
 * for a signed-in user, so the very first request of a session — the login
 * itself — was the one that paid the cold start, and it looked like the app
 * was simply broken.
 *
 * This fires as soon as the JS bundle loads, long before anyone has typed a
 * password, so the server is usually up by the time login is submitted.
 */

export type WarmupState = 'idle' | 'warming' | 'warm' | 'failed';

/** Long enough to outlast a cold boot rather than give up halfway. */
const WARMUP_TIMEOUT_MS = 60_000;
const RETRY_DELAY_MS = 3_000;
const MAX_ATTEMPTS = 3;

let state: WarmupState = 'idle';
let startedAt = 0;
const listeners = new Set<(s: WarmupState) => void>();

function publish(next: WarmupState) {
  if (next === state) return;
  state = next;
  for (const listener of [...listeners]) listener(next);
}

async function attempt(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WARMUP_TIMEOUT_MS);
  try {
    const res = await fetch(`${apiBaseUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Fire-and-forget. Safe to call repeatedly — only one run is ever active. */
export function warmUpServer(): void {
  if (state === 'warming' || state === 'warm') return;
  publish('warming');
  startedAt = Date.now();
  void (async () => {
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      if (!isOnline()) break;
      if (await attempt()) {
        publish('warm');
        return;
      }
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
    // 'failed' is advisory only: it never blocks a request, it just lets the
    // sign-in screen explain the wait instead of leaving it unexplained.
    publish('failed');
  })();
}

export function warmupState(): WarmupState {
  return state;
}

/** How long the current warm-up has been running, in ms. */
export function warmupElapsedMs(): number {
  return startedAt ? Date.now() - startedAt : 0;
}

export function subscribeWarmup(listener: (s: WarmupState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test-only: back to a clean slate. */
export function resetWarmup() {
  state = 'idle';
  startedAt = 0;
  listeners.clear();
}
