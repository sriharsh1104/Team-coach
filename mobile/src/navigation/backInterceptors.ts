/**
 * Android hardware-back interceptors for UI that lives *inside* a stack
 * screen rather than as its own route — an open conversation in the chat
 * hub, an overlay stacked on top of it, and so on.
 *
 * Those cannot use their own `BackHandler` listener: RN runs listeners
 * newest-first, and React runs child effects before parent ones, so the
 * screen-level exit guard (useBlockExitOnRoot, which mounts in the parent)
 * always registered last and won. The result was that backing out of an open
 * chat offered to quit the app instead of returning to the inbox.
 *
 * So the exit guard asks here first, and anything nested registers an
 * interceptor that returns true when it consumed the press.
 */
type BackInterceptor = () => boolean;

const interceptors: BackInterceptor[] = [];

/** Returns the unsubscribe. Innermost (last registered) runs first. */
export function registerBackInterceptor(fn: BackInterceptor): () => void {
  interceptors.push(fn);
  return () => {
    const i = interceptors.indexOf(fn);
    if (i >= 0) interceptors.splice(i, 1);
  };
}

/** True when one of them handled the press and back should stop here. */
export function runBackInterceptors(): boolean {
  for (let i = interceptors.length - 1; i >= 0; i -= 1) {
    try {
      if (interceptors[i]()) return true;
    } catch {
      // A throwing interceptor must not swallow the back press.
    }
  }
  return false;
}

/** Test seam. */
export function resetBackInterceptors() {
  interceptors.length = 0;
}
