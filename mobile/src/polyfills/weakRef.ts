/**
 * Hermes on React Native often lacks WeakRef / FinalizationRegistry (or
 * exposes them only when the microtask queue is enabled). LiveKit and some
 * navigation helpers call `new WeakRef(...)` and crash Team Voice with
 * "Property 'WeakRef' doesn't exist". Strong-ref polyfill is enough for
 * our voice usage — we leave rooms/producers explicitly.
 */
export function ensureWeakRefPolyfill() {
  const root = globalThis as Record<string, unknown>;

  if (typeof root.WeakRef === 'undefined') {
    root.WeakRef = class WeakRefPolyfill<T extends object> {
      private readonly target: T;
      constructor(target: T) {
        this.target = target;
      }
      deref() {
        return this.target;
      }
    };
  }

  if (typeof root.FinalizationRegistry === 'undefined') {
    root.FinalizationRegistry = class FinalizationRegistryPolyfill {
      // eslint-disable-next-line @typescript-eslint/no-useless-constructor, @typescript-eslint/no-unused-vars
      constructor(_cleanup: (heldValue: unknown) => void) {}
      register() {}
      unregister() {
        return false;
      }
    };
  }
}

ensureWeakRefPolyfill();
