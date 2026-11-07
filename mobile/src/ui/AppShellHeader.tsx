import React, { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { MenuButton } from './SideDrawer';
import { SoftPressable } from './SoftPressable';

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
  return (
    <View
      style={[
        styles.topBar,
        includeSafeArea ? { paddingTop: insets.top + 12 } : null,
      ]}
    >
      <MenuButton onPress={onMenu} />
      <View style={styles.titleBlock}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          typeof subtitle === 'string' ? (
            <Text style={styles.subtitle} numberOfLines={1}>
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
          <Text style={styles.settingsIcon}>⚙</Text>
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
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  titleBlock: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    textTransform: 'capitalize',
    letterSpacing: -0.2,
  },
  subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  settingsIcon: { fontSize: 18, color: colors.text },
});
