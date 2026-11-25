type TransitionDirection = 'forward' | 'backward';

type StartViewTransition = (
  callbackOrOptions:
    | (() => void | Promise<void>)
    | {
        update: () => void | Promise<void>;
        types?: string[];
      },
) => { finished: Promise<void> };

/**
 * Directional same-document View Transition with an instant DOM fallback.
 * Types map to `:active-view-transition-type(forward|backward)` in CSS.
 */
export function startDirectionalTransition(
  update: () => void,
  direction: TransitionDirection,
): void {
  const start = (
    document as Document & { startViewTransition?: StartViewTransition }
  ).startViewTransition;

  if (typeof start !== 'function') {
    update();
    return;
  }

  try {
    start.call(document, { update, types: [direction] });
  } catch {
    // Older VT implementations only accept a callback.
    start.call(document, update);
  }
}
