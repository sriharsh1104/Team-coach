import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { goToSection } from './goToSection';
import type { MainStackParamList } from './types';

type MainNav = NativeStackNavigationProp<
  MainStackParamList,
  keyof MainStackParamList
>;

/**
 * Guild Achievements row — same item in OrgHome / GuildHome drawers and
 * useAppDrawer so the label stays identical everywhere.
 */
export function achievementsItem(
  navigation: MainNav,
  home: 'OrgHome' | 'GuildHome',
) {
  return {
    key: 'achievements',
    label: 'Achievements',
    icon: 'trophy-outline' as const,
    onPress: () => goToSection(navigation, home, { screen: 'Achievements' }),
  };
}
