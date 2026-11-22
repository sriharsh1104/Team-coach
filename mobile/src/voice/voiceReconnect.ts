import type { ReconnectContext, ReconnectPolicy } from 'livekit-client';

/** How long we keep trying to get back into the same voice call after a drop. */
export const VOICE_RECONNECT_WINDOW_MS = 60_000;

const MAX_RETRY_DELAY_MS = 7_000;
const FIRST_RETRY_JITTER_MS = 500;

/** Same early curve as LiveKit's default, then keep pulsing until the window ends. */
const EARLY_RETRY_DELAYS_MS = [0, 300, 1_200, 2_700, 4_800, MAX_RETRY_DELAY_MS];

/**
 * LiveKit reconnect policy: retry network drops for up to 1 minute, then stop
 * so the UI can exit the session and the user can tap Join again.
 */
export function createVoiceReconnectPolicy(): ReconnectPolicy {
  return {
    nextRetryDelayInMs(context: ReconnectContext): number | null {
      const remaining = VOICE_RECONNECT_WINDOW_MS - context.elapsedMs;
      if (remaining <= 0) return null;

      const base =
        context.retryCount < EARLY_RETRY_DELAYS_MS.length
          ? EARLY_RETRY_DELAYS_MS[context.retryCount]
          : MAX_RETRY_DELAY_MS;

      let delay: number;
      if (context.retryCount === 0 && base === 0) {
        delay = Math.random() * FIRST_RETRY_JITTER_MS;
      } else {
        delay = Math.round(base * (0.5 + Math.random()));
      }

      return Math.min(delay, remaining);
    },
  };
}

/** Backoff delay for self-hosted (mediasoup) socket rejoin attempts. */
export function voiceRejoinDelayMs(attempt: number, elapsedMs: number): number | null {
  const remaining = VOICE_RECONNECT_WINDOW_MS - elapsedMs;
  if (remaining <= 0) return null;
  const base = Math.min(1_500 * Math.max(attempt, 1), MAX_RETRY_DELAY_MS);
  return Math.min(base, remaining);
}
