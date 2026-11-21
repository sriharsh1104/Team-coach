import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

type Listener = (online: boolean) => void;

/** `code` on the axios error raised when a request is blocked while offline. */
export const OFFLINE_ERROR_CODE = 'ERR_OFFLINE';

/**
 * Optimistic default. NetInfo's first event can take a moment, and treating
 * "unknown" as offline would block the very first request of a cold start.
 */
let online = true;
const listeners = new Set<Listener>();
let stop: (() => void) | null = null;

/**
 * `isInternetReachable` is the stronger signal (connected to a Wi-Fi that
 * has no route out still counts as offline) but it is null until NetInfo
 * finishes probing — only an explicit `false` means offline.
 */
function readOnline(state: NetInfoState): boolean {
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

function publish(next: boolean) {
  if (next === online) return;
  online = next;
  for (const listener of [...listeners]) listener(next);
}

/** Call once at app start. Safe to call again — later calls are no-ops. */
export function startNetworkWatch(): () => void {
  if (stop) return stop;
  const unsubscribe = NetInfo.addEventListener((state) =>
    publish(readOnline(state)),
  );
  void NetInfo.fetch()
    .then((state) => publish(readOnline(state)))
    .catch(() => {
      /* keep the optimistic default */
    });
  stop = () => {
    unsubscribe();
    stop = null;
  };
  return stop;
}

/** For non-React callers (the axios interceptor). */
export function isOnline(): boolean {
  return online;
}

export function subscribeNetworkStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test-only: reset the module back to its optimistic default. */
export function resetNetworkStatus() {
  online = true;
  listeners.clear();
  stop?.();
  stop = null;
}
