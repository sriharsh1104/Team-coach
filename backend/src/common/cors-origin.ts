/**
 * Parses CORS_ORIGIN into what Nest / socket.io's `cors.origin` expects.
 *
 *   unset / "*"                         -> "*"
 *   "https://www.sacredesports.com"     -> "https://www.sacredesports.com"
 *   "https://a.com, tauri://localhost"  -> ["https://a.com", "tauri://localhost"]
 *
 * The comma form is needed once the Tauri desktop app talks to the same API:
 * its origin is tauri://localhost on Linux/macOS and http://tauri.localhost
 * on Windows, and the `cors` package only does exact-match on a plain string.
 */
export function corsOrigin(): string | string[] {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw) return '*';
  const list = raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (list.length === 0) return '*';
  return list.length === 1 ? list[0] : list;
}
