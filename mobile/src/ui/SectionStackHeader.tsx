import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeaderOrgInfo } from './HeaderOrgInfo';
import { HeaderSettingsButton } from './HeaderSettingsButton';
import { MenuButton } from './SideDrawer';
import { SectionFlowHeader } from './SectionFlowHeader';
import { useTheme } from '../theme/ThemeContext';

type Props = {
  navigation: { canGoBack: () => boolean; goBack: () => void };
  openWith: (nav: Props['navigation']) => void;
  sectionTitle: string;
};

/**
 * Consistent section chrome (Media / Stats / Maps / Voice / …), matching
 * OrgHome + ChatHub:
 *   top row  — hamburger · org name (+ ping / code) · settings
 *   next row — back + section title (same flow header as an open chat)
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
          paddingTop: insets.top,
        },
      ]}
    >
      <View style={[styles.topRow, { borderBottomColor: colors.border }]}>
        <MenuButton onPress={() => openWith(navigation)} />
        <View style={styles.titleWrap}>
          <HeaderOrgInfo fallbackTitle={sectionTitle} />
        </View>
        <HeaderSettingsButton />
      </View>
      {canPop ? (
        <SectionFlowHeader
          title={sectionTitle}
          onBack={() => navigation.goBack()}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {},
  topRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    paddingBottom: 2,
  },
});
