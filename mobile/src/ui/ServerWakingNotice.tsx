import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useServerWarmup } from '../perf/useServerWarmup';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';

/**
 * Explains a slow first request on the auth screens.
 *
 * The backend sleeps when idle, so the first sign-in after a quiet spell
 * can sit there for the better part of a minute. Unexplained, that reads as
 * a broken app; named, it reads as a cold server — and by the time the
 * notice appears the warm-up is already in flight.
 */
export function ServerWakingNotice() {
  const { state, slow } = useServerWarmup();
  const { colors } = useTheme();
  const styles = useThemedStyles(noticeStyles);

  if (state !== 'warming' || !slow) return null;

  return (
    <View style={styles.row} accessibilityLiveRegion="polite">
      <ActivityIndicator size="small" color={colors.textMuted} />
      <Text style={styles.text}>
        Waking the server — the first load after a quiet spell can take up to
        a minute.
      </Text>
    </View>
  );
}

function noticeStyles(c: ThemeColors) {
  return {
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 10,
      marginBottom: 12,
      paddingHorizontal: 4,
    },
    text: {
      flex: 1,
      color: c.textMuted,
      fontSize: 12,
      lineHeight: 17,
    },
  };
}
