type Listener = (activeId: string | null) => void;

const listeners = new Set<Listener>();
let activeId: string | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

/** Mark this copy control as the only one showing a ✓; clears after durationMs. */
export function claimCopyFeedback(id: string, durationMs = 1200) {
  activeId = id;
  listeners.forEach((listener) => listener(activeId));
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    if (activeId === id) {
      activeId = null;
      listeners.forEach((listener) => listener(null));
    }
  }, durationMs);
}

export function subscribeCopyFeedback(listener: Listener) {
  listeners.add(listener);
  listener(activeId);
  return () => {
    listeners.delete(listener);
  };
}
