import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { BrandWatermark } from './BrandWatermark';

/** Dark Sacred shell with watermark — wrap any in-app screen content. */
export function Screen({
  children,
  style,
  /** Extra top inset when the screen has no stack header (e.g. OrgHome). */
  padTop = false,
  /** Bottom home-indicator inset (default on). */
  padBottom = true,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  padTop?: boolean;
  padBottom?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.root,
        padTop ? { paddingTop: insets.top } : null,
        padBottom ? { paddingBottom: insets.bottom } : null,
        style,
      ]}
    >
      <BrandWatermark variant="subtle" />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1 },
});
