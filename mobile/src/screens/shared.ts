import { StyleSheet } from 'react-native';
import { colors } from '../theme';
import { MembershipRole } from '../api/types';

/** "Coach (Owner)" / "Player" — the shared org-role badge format, used by
 * chat sender labels and member profile headers alike. Null when the
 * member has no current org role to show. */
export function formatRoleBadge(
  role: MembershipRole | null,
  isOwner: boolean,
): string | null {
  if (!role) return null;
  const label = role.charAt(0) + role.slice(1).toLowerCase();
  return `${label}${isOwner ? ' (Owner)' : ''}`;
}

/**
 * Platform-wide Sacred dark styles (org home, profile, lists, auth forms).
 * Titles use Title Case via textTransform.
 */
export const sharedStyles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
    color: colors.text,
    textTransform: 'capitalize',
    letterSpacing: -0.3,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 12,
    fontSize: 16,
    color: colors.text,
  },
  button: {
    backgroundColor: colors.chrome,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: colors.chromeInk,
    fontWeight: '700',
    fontSize: 16,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 12,
    marginBottom: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  link: {
    marginTop: 16,
    textAlign: 'center',
    color: colors.link,
    fontWeight: '600',
  },
  error: {
    color: colors.danger,
    marginBottom: 12,
    textAlign: 'center',
  },
});

/** @deprecated Use sharedStyles — kept as an alias for auth screens. */
export const authStyles = sharedStyles;
