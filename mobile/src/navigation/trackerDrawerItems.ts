import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SideDrawerItem, SideDrawerSection } from '../ui/SideDrawer';
import { goToSection } from './goToSection';
import type { MainStackParamList } from './types';

type MainNav = NativeStackNavigationProp<
  MainStackParamList,
  keyof MainStackParamList
>;

/** Health + Daily Routine rows — same items in OrgHome / GuildHome / useAppDrawer. */
export function trackerDrawerSection(
  navigation: MainNav,
  home: 'OrgHome' | 'GuildHome',
): SideDrawerSection {
  return {
    key: 'tracker',
    label: 'Tracker',
    split: true,
    items: trackerDrawerItems(navigation, home),
  };
}

export function trackerDrawerItems(
  navigation: MainNav,
  home: 'OrgHome' | 'GuildHome',
): SideDrawerItem[] {
  return [
    {
      key: 'health',
      label: 'Health',
      icon: 'bar-chart-outline' as const,
      onPress: () => goToSection(navigation, home, { screen: 'Health' }),
    },
    {
      key: 'dailyRoutine',
      label: 'Daily Routine',
      icon: 'alarm-outline' as const,
      onPress: () => goToSection(navigation, home, { screen: 'DailyRoutine' }),
    },
  ];
}
