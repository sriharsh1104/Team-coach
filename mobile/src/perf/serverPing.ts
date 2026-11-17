import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { apiBaseUrl } from '../api/client';

/**
 * Live round-trip time to the backend, game-style: GET /health every
 * PING_INTERVAL_MS while the app is in the foreground and at least one
 * component is showing it. One shared poller for the whole app, however
 * many headers subscribe.
 */
const PING_INTERVAL_MS = 3000;
const PING_TIMEOUT_MS = 5000;

export type PingSample = { ms: number | null; failed: boolean };

let sample: PingSample = { ms: null, failed: false };
const listeners = new Set<(s: PingSample) => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight = false;
let foreground = true;

function publish(next: PingSample) {
  sample = next;
  listeners.forEach((l) => l(sample));
}

function nowMs(): number {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}

async function pingOnce() {
  if (inflight) return;
  inflight = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  const started = nowMs();
  try {
    const res = await fetch(`${apiBaseUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
      // Never serve this from any cache — we want the real round trip.
      headers: { 'Cache-Control': 'no-cache' },
    });
    const ms = Math.max(1, Math.round(nowMs() - started));
    publish({ ms, failed: !res.ok });
  } catch {
    publish({ ms: null, failed: true });
  } finally {
    clearTimeout(timeout);
    inflight = false;
  }
}

function schedule() {
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    if (listeners.size === 0 || !foreground) return;
    await pingOnce();
    schedule();
  }, PING_INTERVAL_MS);
}

function start() {
  if (listeners.size === 0 || !foreground) return;
  if (!timer) {
    void pingOnce().then(schedule);
  }
}

function stop() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

AppState.addEventListener('change', (state) => {
  foreground = state === 'active';
  if (foreground) start();
  else stop();
});

/** Subscribe to the live server ping (starts the poller on first use). */
export function useServerPing(): PingSample {
  const [value, setValue] = useState<PingSample>(sample);
  useEffect(() => {
    listeners.add(setValue);
    setValue(sample);
    start();
    return () => {
      listeners.delete(setValue);
      if (listeners.size === 0) stop();
    };
  }, []);
  return value;
}

export function pingColor(ms: number | null, failed: boolean): string {
  if (failed || ms === null) return '#ef4444';
  if (ms < 100) return '#22c55e';
  if (ms < 250) return '#f59e0b';
  return '#ef4444';
}
