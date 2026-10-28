import { customAlphabet } from 'nanoid';

// Numeric to match the 6-digit-code mental model the app already uses for
// 2FA (two-factor.util.ts) — the mobile verification screen looks and feels
// the same either way.
const generateOtpDigits = customAlphabet('0123456789', 6);

export function generateEmailOtp(): string {
  return generateOtpDigits();
}
