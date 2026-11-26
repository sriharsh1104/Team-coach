import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { goToSection } from '../navigation/goToSection';
import type { MainStackParamList } from '../navigation/types';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { AppIcon, AppIconName } from './AppIcon';
import { SoftPressable } from './SoftPressable';

export type MainTabKey = 'chat' | 'games' | 'goLive' | 'call';

type Home = 'OrgHome' | 'GuildHome';
type Nav = NativeStackNavigationProp<MainStackParamList, keyof MainStackParamList>;

type TabDef = {
  key: MainTabKey;
  label: string;
  icon: AppIconName;
};

const TABS: TabDef[] = [
  { key: 'chat', label: 'Chat', icon: 'home-outline' },
  { key: 'games', label: 'Games', icon: 'game-controller-outline' },
  { key: 'goLive', label: 'Go Live', icon: 'play' },
  { key: 'call', label: 'Guild Call', icon: 'headset' },
];

/** Pill row height excluding safe-area (used by overlay clearance helpers). */
const PILL_BLOCK = 64;

function navigateTab(navigation: Nav, home: Home, key: MainTabKey) {
  switch (key) {
    case 'chat':
      goToSection(navigation, home);
      return;
    case 'games':
      goToSection(navigation, home, { screen: 'Games' });
      return;
    case 'goLive':
      goToSection(navigation, home, { screen: 'GoLive' });
      return;
    case 'call':
      goToSection(navigation, home, { screen: 'GuildVoice' });
      return;
  }
}

export function floatingTabBarInset(safeBottom: number): number {
  return Math.max(safeBottom, 10);
}

/** @deprecated Overlay clearance — prefer the docked RootNavigator bar. */
export function useFloatingTabBarClearance(): number {
  const insets = useSafeAreaInsets();
  return PILL_BLOCK + floatingTabBarInset(insets.bottom);
}

/** @deprecated Prefer the docked RootNavigator bar. */
export const FLOATING_TAB_BAR_CLEARANCE = PILL_BLOCK + 14;

/**
 * Floating pill: Chat · Games · Go Live · Guild Call.
 *
 * `docked` (default for the global host) sits in normal layout and shrinks
 * the screen above it. `overlay` is absolute — only for rare local hosts.
 */
export function FloatingMainTabBar({
  navigation,
  home,
  active,
  docked = true,
}: {
  navigation: Nav;
  home: Home;
  active: MainTabKey;
  docked?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const bottomPad = floatingTabBarInset(insets.bottom);

  return (
    <View
      pointerEvents="box-none"
      style={[
        docked ? staticStyles.dock : staticStyles.overlay,
        { paddingBottom: bottomPad },
      ]}
    >
      <View style={[styles.pill, { borderColor: colors.link }]}>
        {TABS.map((tab) => {
          const selected = tab.key === active;
          const isCenter = tab.key === 'goLive';
          return (
            <SoftPressable
              key={tab.key}
              style={staticStyles.tab}
              onPress={() => navigateTab(navigation, home, tab.key)}
              pressScale={0.92}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={tab.label}
            >
              <View
                style={[
                  isCenter ? staticStyles.centerWrap : staticStyles.iconWrap,
                  selected && { backgroundColor: colors.link },
                  isCenter &&
                    !selected && {
                      backgroundColor: colors.chrome,
                    },
                ]}
              >
                <AppIcon
                  name={tab.icon}
                  size={isCenter ? 22 : 20}
                  color={
                    selected || isCenter ? colors.chromeInk : colors.textMuted
                  }
                />
              </View>
            </SoftPressable>
          );
        })}
      </View>
    </View>
  );
}

const staticStyles = StyleSheet.create({
  dock: {
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 6,
    zIndex: 100,
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: 18,
    zIndex: 100,
    elevation: 24,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

function makeStyles(c: ThemeColors) {
  return {
    pill: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      width: '100%' as const,
      maxWidth: 420,
      borderRadius: 999,
      borderWidth: 1.5,
      backgroundColor: c.surface,
      paddingHorizontal: 8,
      paddingVertical: 4,
      shadowColor: '#000',
      shadowOpacity: 0.22,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 12,
    },
  };
}
