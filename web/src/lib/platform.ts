/**
 * True when the UI is running inside the Tauri desktop app (web/src-tauri)
 * instead of a normal browser tab. Tauri 2 injects `__TAURI_INTERNALS__`
 * into every window it owns.
 */
export function isDesktopApp(): boolean {
  return (
    typeof window !== 'undefined' &&
    '__TAURI_INTERNALS__' in window
  );
}
