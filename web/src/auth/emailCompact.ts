/** First 5 characters of the local part, then ***, then @domain. */
export function emailCompact(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0) return trimmed;

  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at);
  if (local.length <= 5) return `${local}${domain}`;
  return `${local.slice(0, 5)}***${domain}`;
}
