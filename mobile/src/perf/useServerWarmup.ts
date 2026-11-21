import { useEffect, useState } from 'react';
import {
  WarmupState,
  subscribeWarmup,
  warmupElapsedMs,
  warmupState,
} from './serverWarmup';

/** Only worth telling the user about once the wait is actually noticeable. */
const SLOW_AFTER_MS = 2500;

/**
 * `slow` is true while the backend is still waking and has been for long
 * enough that silence would read as a bug.
 */
export function useServerWarmup(): { state: WarmupState; slow: boolean } {
  const [state, setState] = useState<WarmupState>(warmupState);
  const [slow, setSlow] = useState(
    () => warmupState() === 'warming' && warmupElapsedMs() > SLOW_AFTER_MS,
  );

  useEffect(() => subscribeWarmup(setState), []);

  useEffect(() => {
    if (state !== 'warming') {
      setSlow(false);
      return;
    }
    const remaining = Math.max(0, SLOW_AFTER_MS - warmupElapsedMs());
    const timer = setTimeout(() => setSlow(true), remaining);
    return () => clearTimeout(timer);
  }, [state]);

  return { state, slow };
}
