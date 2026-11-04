type ToastListener = (message: string, durationMs?: number) => void;

let listener: ToastListener | null = null;

/** Registered by ToastProvider so axios (and non-React call sites) can toast. */
export function setToastListener(next: ToastListener | null) {
  listener = next;
}

export function emitToast(message: string, durationMs = 4000) {
  const text = message?.trim();
  if (!text) return;
  listener?.(text, durationMs);
}
