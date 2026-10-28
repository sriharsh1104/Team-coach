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

// window: 1 allows one 30s step of clock drift either side between the
// server and the user's authenticator app.
export function verifyTwoFactorCode(secret: string, code: string): boolean {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: code,
    window: 1,
  });
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
