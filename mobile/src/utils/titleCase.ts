/**
 * Title Case: first letter of each word capital.
 * Use for nav titles / headings that are plain strings (not Text styles).
 */
export function titleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((word) =>
      word.length === 0
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(' ');
}
