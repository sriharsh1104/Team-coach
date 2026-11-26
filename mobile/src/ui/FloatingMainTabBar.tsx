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

/**
 * Floating pill tab bar for primary Sacred destinations.
 * Chat · Games · Go Live · Guild Call
 */
export function FloatingMainTabBar({
  navigation,
  home,
  active,
}: {
  navigation: Nav;
  home: Home;
  active: MainTabKey;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View
      pointerEvents="box-none"
      style={[
        staticStyles.host,
        { paddingBottom: Math.max(insets.bottom, 10) },
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

/** Extra scroll/content padding so lists clear the floating pill. */
export const FLOATING_TAB_BAR_CLEARANCE = 78;

const staticStyles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: 18,
    zIndex: 30,
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
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 10,
    },
  };
}
