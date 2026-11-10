import { ThemeColors } from '../theme';
import { useThemedStyles } from '../theme/useThemedStyles';
import { MembershipRole } from '../api/types';

/** "Coach (Owner)" / "Player" — the shared org-role badge format, used by
 * chat sender labels and member profile headers alike. Null when the
 * member has no current org role to show. */
export function formatRoleBadge(
  role: MembershipRole | null,
  isOwner: boolean,
): string | null {
  if (!role) return isOwner ? 'Owner' : null;
  const label = role.charAt(0) + role.slice(1).toLowerCase();
  return `${label}${isOwner ? ' (Owner)' : ''}`;
}

/**
 * Platform-wide Sacred styles (org home, profile, lists, auth forms).
 * Titles use Title Case via textTransform.
 *
 * Theme-dependent — a plain factory, never a module-load StyleSheet.create,
 * so switching theme can't leave these frozen on the startup palette.
 * Read them through `useSharedStyles()` inside a component.
 */
export function sharedStylesFactory(c: ThemeColors) {
  return {
    container: {
      flex: 1,
      padding: 24,
      justifyContent: 'center' as const,
      backgroundColor: 'transparent',
    },
    title: {
      fontSize: 26,
      fontWeight: '700' as const,
      marginBottom: 20,
      textAlign: 'center' as const,
      color: c.text,
      textTransform: 'capitalize' as const,
      letterSpacing: -0.3,
    },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: 'rgba(0,0,0,0.28)',
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 13,
      marginBottom: 12,
      fontSize: 16,
      color: c.text,
    },
    button: {
      backgroundColor: c.chrome,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginTop: 8,
    },
    buttonDisabled: {
      opacity: 0.45,
    },
    buttonText: {
      color: c.chromeInk,
      fontWeight: '700' as const,
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
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
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
      textAlign: 'center' as const,
      color: c.link,
      fontWeight: '600' as const,
    },
    error: {
      color: c.danger,
      marginBottom: 12,
      textAlign: 'center' as const,
    },
  };
}

/** Live platform-wide styles — rebuilt on every theme change. */
export function useSharedStyles() {
  return useThemedStyles(sharedStylesFactory);
}
