type LoaderListener = (visible: boolean) => void;

let listener: LoaderListener | null = null;
let depth = 0;

export function setLoaderListener(next: LoaderListener | null) {
  listener = next;
  listener?.(depth > 0);
}

export function beginLoader() {
  depth += 1;
  listener?.(true);
}

export function endLoader() {
  depth = Math.max(0, depth - 1);
  listener?.(depth > 0);
}

export function resetLoader() {
  depth = 0;
  listener?.(false);
}
