/**
 * Pure helpers for chat link previews — no I/O here, so these are fully
 * unit-testable. The actual outbound fetch (with DNS-resolved SSRF check,
 * timeout, size cap) lives in chat.controller.ts.
 */

export interface LinkPreviewData {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

/**
 * True when a hostname/IP must never be fetched server-side: loopback,
 * private ranges, link-local (includes cloud metadata endpoints like
 * 169.254.169.254), and anything not a plain public-looking host. This is
 * checked against the DNS-RESOLVED address, not just the string the user
 * typed, so "evil.com" that resolves to 127.0.0.1 is still caught.
 */
export function isDisallowedAddress(address: string): boolean {
  const a = address.toLowerCase();

  // IPv6 loopback / unspecified / link-local / unique-local.
  if (
    a === '::1' ||
    a === '::' ||
    a.startsWith('fe80:') ||
    a.startsWith('fc') ||
    a.startsWith('fd')
  ) {
    return true;
  }
  // IPv4-mapped IPv6 (::ffff:127.0.0.1) — recurse on the embedded IPv4 part.
  const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isDisallowedAddress(mapped[1]);

  const parts = a.split('.');
  if (parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p))) {
    const [p0, p1] = parts.map(Number);
    if (p0 === 127) return true; // loopback
    if (p0 === 10) return true; // private
    if (p0 === 172 && p1 >= 16 && p1 <= 31) return true; // private
    if (p0 === 192 && p1 === 168) return true; // private
    if (p0 === 169 && p1 === 254) return true; // link-local (incl. cloud metadata)
    if (p0 === 0) return true; // "this network"
    if (p0 >= 224) return true; // multicast/reserved
    return false;
  }
  // Anything else unparseable as a plain IPv4/known-IPv6 literal: let the
  // caller's own hostname allowlist (localhost/.local/.internal) handle it.
  return false;
}

const DISALLOWED_HOSTNAME_RE =
  /(^|\.)(localhost|local|internal|intranet|lan)$/i;

/** Hostname-level check, before any DNS lookup even happens. */
export function isDisallowedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (h === 'localhost' || h === '0.0.0.0' || h === '[::1]' || h === '::1')
    return true;
  if (DISALLOWED_HOSTNAME_RE.test(h)) return true;
  if (isDisallowedAddress(h)) return true;
  return false;
}

/** Only fetch plain http(s) URLs — rejects file:, javascript:, data:, etc. */
export function isFetchableUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname) return null;
  return url;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function firstMatch(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1].trim());
  }
  return null;
}

/**
 * Minimal Open Graph / plain-HTML metadata scrape — regex-based on purpose
 * (no DOM parser dependency) since we only need four well-known tags and
 * the input is a size-capped HTML string, not something we execute.
 */
export function parseOpenGraph(
  html: string,
  sourceUrl: string,
): LinkPreviewData {
  const metaContent = (prop: string) =>
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`,
      'i',
    );
  const metaContentReversed = (prop: string) =>
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`,
      'i',
    );

  const title =
    firstMatch(html, [
      metaContent('og:title'),
      metaContentReversed('og:title'),
    ]) ?? firstMatch(html, [/<title[^>]*>([^<]*)<\/title>/i]);
  const description = firstMatch(html, [
    metaContent('og:description'),
    metaContentReversed('og:description'),
    metaContent('description'),
    metaContentReversed('description'),
  ]);
  const image = firstMatch(html, [
    metaContent('og:image'),
    metaContentReversed('og:image'),
  ]);
  const siteName = firstMatch(html, [
    metaContent('og:site_name'),
    metaContentReversed('og:site_name'),
  ]);

  let absoluteImage = image;
  if (image) {
    try {
      absoluteImage = new URL(image, sourceUrl).toString();
    } catch {
      absoluteImage = null;
    }
  }

  return {
    url: sourceUrl,
    title: title ? title.slice(0, 200) : null,
    description: description ? description.slice(0, 300) : null,
    image: absoluteImage,
    siteName: siteName ? siteName.slice(0, 100) : null,
  };
}
