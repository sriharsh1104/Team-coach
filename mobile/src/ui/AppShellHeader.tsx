import React, { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MenuButton } from './SideDrawer';
import { SoftPressable } from './SoftPressable';
import { useTheme } from '../theme/ThemeContext';
import { PingLabel } from './PingLabel';

type Props = {
  title: string;
  subtitle?: ReactNode;
  onMenu: () => void;
  onSettings?: () => void;
  /** When embedded under a native stack that already pads the status bar. */
  includeSafeArea?: boolean;
  /** Show the live server ping "(42ms)" right after the title (org name). */
  showPing?: boolean;
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
  showPing = false,
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
          paddingTop: includeSafeArea ? insets.top + 6 : 6,
        },
      ]}
    >
      <MenuButton onPress={onMenu} />
      <View style={styles.titleBlock}>
        <View style={styles.titleRow}>
          <Text
            style={[styles.title, { color: colors.text }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {showPing ? <PingLabel style={styles.ping} /> : null}
        </View>
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
          style={styles.settingsBtn}
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
  // Same 12px inset as SectionStackHeader / SectionFlowHeader so hamburger
  // and the back chevron share one vertical edge. Icons are 44 tall so they
  // span title → org code; padding under the row stays tight to the border.
  topBar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleBlock: { flex: 1, minWidth: 0, paddingBottom: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', minWidth: 0 },
  title: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '700',
    textTransform: 'capitalize',
    letterSpacing: -0.2,
  },
  subtitle: { fontSize: 11, marginTop: 1 },
  ping: { fontSize: 12, textTransform: 'none' },
  settingsBtn: {
    width: 36,
    alignSelf: 'stretch',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
  },
  settingsIcon: { fontSize: 20 },
});
