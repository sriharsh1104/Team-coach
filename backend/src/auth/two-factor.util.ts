import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { customAlphabet } from 'nanoid';

const ISSUER = 'Team Coach';

export function generateTwoFactorSecret(email: string): {
  base32: string;
  otpauthUrl: string;
} {
  const secret = speakeasy.generateSecret({
    name: `${ISSUER}:${email}`,
    issuer: ISSUER,
    otpauth_url: true,
  });
  return { base32: secret.base32, otpauthUrl: secret.otpauth_url };
}

export function generateQrCodeDataUrl(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl);
}

const TOTP_STEP_SECONDS = 30;

// window: 1 allows one 30s step of clock drift either side between the
// server and the user's authenticator app.
//
// `lastUsedStep` (the caller's persisted User.lastTotpStep) makes this
// anti-replay: a TOTP code is valid input for its whole ~30-90s window, so
// without tracking which step was already spent, the exact same code could
// be reused more than once within that window. Returns the step that
// matched (the caller should persist it) so the next call can reject it.
export function verifyTwoFactorCode(
  secret: string,
  code: string,
  lastUsedStep?: number | null,
): { valid: boolean; step?: number } {
  const result = speakeasy.totp.verifyDelta({
    secret,
    encoding: 'base32',
    token: code,
    window: 1,
  });
  if (!result) return { valid: false };

  const step = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS) + result.delta;
  if (lastUsedStep != null && step <= lastUsedStep) {
    return { valid: false };
  }
  return { valid: true, step };
}

// Unambiguous uppercase alphabet (no 0/O/1/I), same convention as org codes
// (org.service.ts) — formatted with a dash purely for readability.
const generateBackupCodeChars = customAlphabet(
  'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  10,
);

export function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const chars = generateBackupCodeChars();
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}
