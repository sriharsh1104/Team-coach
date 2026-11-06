type LoaderListener = (visible: boolean) => void;

let listener: LoaderListener | null = null;
let depth = 0;
let showTimer: ReturnType<typeof setTimeout> | null = null;

/** Don't flash the full-screen loader for fast requests — that was the "blink". */
const SHOW_DELAY_MS = 450;

export function setLoaderListener(next: LoaderListener | null) {
  listener = next;
  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
  }
  listener?.(depth > 0);
}

export function beginLoader() {
  depth += 1;
  if (depth === 1) {
    if (showTimer) clearTimeout(showTimer);
    showTimer = setTimeout(() => {
      showTimer = null;
      if (depth > 0) listener?.(true);
    }, SHOW_DELAY_MS);
  }
}

export function endLoader() {
  depth = Math.max(0, depth - 1);
  if (depth === 0) {
    if (showTimer) {
      clearTimeout(showTimer);
      showTimer = null;
    }
    listener?.(false);
  }
}

export function resetLoader() {
  depth = 0;
  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
  }
  listener?.(false);
}
