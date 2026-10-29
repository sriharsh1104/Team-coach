import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { SoftPressable } from './SoftPressable';

export type SegmentTab<T extends string> = {
  value: T;
  label: string;
  accessibilityLabel?: string;
};

/** Pill-track tab strip matching Security / Stats chrome. */
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
            pressScale={0.96}
          >
            <Text
              style={active ? styles.tabTextActive : styles.tabText}
              numberOfLines={1}
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
    flexWrap: 'wrap',
    gap: 6,
    padding: 4,
    marginBottom: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  tab: {
    flexGrow: 1,
    flexBasis: '28%',
    minWidth: 88,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 10,
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
