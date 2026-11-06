import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { SoftPressable } from './SoftPressable';

export type SegmentTab<T extends string> = {
  value: T;
  label: string;
  accessibilityLabel?: string;
};

/** Equal-width pill row — never wraps (was expanding Upcoming/Past/Results oddly). */
export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly SegmentTab<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <View style={styles.track}>
      {tabs.map((tab) => {
        const active = value === tab.value;
        return (
          <SoftPressable
            key={tab.value}
            style={[styles.tab, active && styles.tabActive]}
            onPress={() => onChange(tab.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.accessibilityLabel ?? tab.label}
            pressScale={0.97}
          >
            <Text
              style={active ? styles.tabTextActive : styles.tabText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {tab.label}
            </Text>
          </SoftPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 4,
    padding: 4,
    marginBottom: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  tab: {
    flex: 1,
    minWidth: 0,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: colors.chrome },
  tabText: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
  tabTextActive: {
    color: colors.chromeInk,
    fontWeight: '700',
    fontSize: 13,
  },
});
