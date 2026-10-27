import { StyleSheet } from 'react-native';
import { colors } from '../theme';

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
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 24,
    textAlign: 'center',
    color: colors.text,
    textTransform: 'capitalize',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 16,
    color: colors.text,
  },
  button: {
    backgroundColor: colors.chrome,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.chromeInk,
    fontWeight: '700',
    fontSize: 16,
  },

  link: {
    marginTop: 16,
    textAlign: 'center',
    color: colors.link,
  },
  error: {
    color: colors.danger,
    marginBottom: 12,
    textAlign: 'center',
  },
});

/** @deprecated Use sharedStyles — kept as an alias for auth screens. */
export const authStyles = sharedStyles;
