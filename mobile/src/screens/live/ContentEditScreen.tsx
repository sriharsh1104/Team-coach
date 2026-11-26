import React from 'react';
import { Text, View } from 'react-native';
import { Screen } from '../../brand/Screen';
import { ThemeColors } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';

/**
 * Placeholder for upcoming content-edit tools under Streaming & Content Tools.
 * Navigation + drawer entry are wired; feature work comes later.
 */
export function ContentEditScreen() {
  const styles = useThemedStyles(makeStyles);
  return (
    <Screen>
      <View style={styles.wrap}>
        <Text style={styles.title}>Edit</Text>
        <Text style={styles.body}>
          Content editing tools will show up here. This screen is a placeholder
          for now.
        </Text>
      </View>
    </Screen>
  );
}

function makeStyles(c: ThemeColors) {
  return {
    wrap: { flex: 1, padding: 20, gap: 10 },
    title: {
      color: c.text,
      fontSize: 28,
      fontWeight: '700' as const,
      letterSpacing: -0.4,
    },
    body: {
      color: c.textMuted,
      fontSize: 15,
      lineHeight: 22,
    },
  };
}
