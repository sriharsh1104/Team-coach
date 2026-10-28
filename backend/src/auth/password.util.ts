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
const ALL = UPPER + LOWER + DIGITS + SPECIAL;

function pick(charset: string): string {
  return charset[randomInt(charset.length)];
}

// Generated once per new Google signup and emailed in plaintext — guaranteed
// to satisfy PASSWORD_REGEX so it always works for a later email+password
// login, by construction rather than by chance.
export function generateRandomPassword(length = 16): string {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SPECIAL)];
  for (let i = chars.length; i < length; i += 1) {
    chars.push(pick(ALL));
  }

  // Fisher-Yates shuffle so the guaranteed classes aren't always in the same
  // leading positions.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}
