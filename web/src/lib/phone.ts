import type { Country } from 'react-phone-number-input';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

/** Coerce legacy bare digits / messy input into E.164 for the phone field. */
export function coercePhoneToE164(
  phone: string | null | undefined,
  defaultCountry: Country = 'IN',
): string {
  if (!phone?.trim()) return '';
  const trimmed = phone.trim();
  const parsed = parsePhoneNumberFromString(
    trimmed.startsWith('+') ? trimmed : trimmed,
    defaultCountry,
  );
  if (parsed?.number) return parsed.number;

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) {
    return `+91${digits.slice(1)}`;
  }
  return trimmed.startsWith('+') ? `+${digits}` : `+${digits}`;
}
