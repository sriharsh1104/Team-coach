import React, { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MenuButton } from './SideDrawer';
import { SoftPressable } from './SoftPressable';
import { useTheme } from '../theme/ThemeContext';

type Props = {
  title: string;
  subtitle?: ReactNode;
  onMenu: () => void;
  onSettings?: () => void;
  /** When embedded under a native stack that already pads the status bar. */
  includeSafeArea?: boolean;
};

/**
 * Shared top chrome for Org/Guild shells and section screens — hamburger,
 * title/subtitle, optional settings gear.
 */
export function AppShellHeader({
  title,
  subtitle,
  onMenu,
  onSettings,
  includeSafeArea = true,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.topBar,
        {
          backgroundColor: colors.bg,
          borderBottomColor: colors.border,
          paddingTop: includeSafeArea ? insets.top + 12 : 12,
        },
      ]}
    >
      <MenuButton onPress={onMenu} />
      <View style={styles.titleBlock}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          typeof subtitle === 'string' ? (
            <Text
              style={[styles.subtitle, { color: colors.textMuted }]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : (
            subtitle
          )
        ) : null}
      </View>
      {onSettings ? (
        <SoftPressable
          onPress={onSettings}
          accessibilityRole="button"
          accessibilityLabel="Account Settings"
          hitSlop={8}
          style={[styles.settingsBtn, { backgroundColor: colors.surface }]}
          pressScale={0.9}
        >
          <Text style={[styles.settingsIcon, { color: colors.icon }]}>⚙</Text>
        </SoftPressable>
      ) : (
        <View style={styles.settingsBtn} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleBlock: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textTransform: 'capitalize',
    letterSpacing: -0.2,
  },
  subtitle: { fontSize: 12, marginTop: 2 },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIcon: { fontSize: 18 },
});
