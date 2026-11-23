import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from './AppIcon';
import { HeaderOrgInfo } from './HeaderOrgInfo';
import { HeaderSettingsButton } from './HeaderSettingsButton';
import { MenuButton } from './SideDrawer';
import { SoftPressable } from './SoftPressable';
import { useTheme } from '../theme/ThemeContext';

type Props = {
  navigation: { canGoBack: () => boolean; goBack: () => void };
  openWith: (nav: Props['navigation']) => void;
  sectionTitle: string;
};

/**
 * Consistent section chrome (Media / Stats / Maps / Guild / …):
 *   top row  — hamburger (always left) · title · settings
 *   next row — back chevron only when the stack can pop (same placement as
 *              ChatFlowHeader when a chat is open — never beside the menu)
 */
export function SectionStackHeader({
  navigation,
  openWith,
  sectionTitle,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const canPop = navigation.canGoBack();

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.bg,
          borderBottomColor: colors.border,
          paddingTop: insets.top,
        },
      ]}
    >
      <View style={styles.topRow}>
        <MenuButton onPress={() => openWith(navigation)} />
        <View style={styles.titleWrap}>
          <HeaderOrgInfo sectionTitle={sectionTitle} />
        </View>
        <HeaderSettingsButton />
      </View>
      {canPop ? (
        <SoftPressable
          onPress={() => navigation.goBack()}
          style={styles.backRow}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={10}
          pressScale={0.92}
        >
          <AppIcon name="chevron-back" size={26} color={colors.icon} />
        </SoftPressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    minHeight: 52,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  backRow: {
    width: 36,
    height: 36,
    marginLeft: 12,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
