import { randomInt } from 'crypto';

export const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export const PASSWORD_REGEX_MESSAGE =
  'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.';

// Unambiguous alphabets (no 0/O/1/I/l), same convention as the 2FA backup-code
// charset in two-factor.util.ts.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SPECIAL = '!@#$%^&*';

function pick(charset: string): string {
  return charset[randomInt(charset.length)];
}

/**
 * Google-signup password emailed in plaintext to brand-new accounts.
 * Exactly 8 chars (max), with ≥1 uppercase, ≥1 digit, ≥1 special, plus
 * lowercase so it always satisfies PASSWORD_REGEX for later email login.
 */
export function generateRandomPassword(_length = 8): string {
  const size = 8;
  const chars = [pick(UPPER), pick(DIGITS), pick(SPECIAL)];
  while (chars.length < size) {
    chars.push(pick(LOWER));
  }

  // Fisher-Yates so required classes aren't always in fixed positions.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}
