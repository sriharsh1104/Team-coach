/**
 * Backend builds invite URLs from WEB_PUBLIC_URL. If that env is missing on
 * Render it falls back to localhost — rewrite those to the current web origin
 * so production invite/QR links stay usable.
 */
export function publicInviteUrl(referralLink: string): string {
  try {
    const parsed = new URL(referralLink);
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return `${window.location.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    /* keep original */
  }
  return referralLink;
}
