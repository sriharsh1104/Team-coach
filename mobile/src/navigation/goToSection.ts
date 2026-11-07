import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from './types';

/**
 * Drawer section jumps push onto the MainStack (or pop back to a screen
 * already in it) so Android/system back reverses the same path the user
 * took forward. Previously this used CommonActions.reset([home, target]),
 * which wiped history — one back landed on home, the next exited the app.
 */
export function goToSection<RouteName extends keyof MainStackParamList>(
  navigation: NativeStackNavigationProp<MainStackParamList, RouteName>,
  homeScreen: 'OrgHome' | 'GuildHome',
  target?: { screen: keyof MainStackParamList; params?: object },
) {
  if (!target) {
    navigation.navigate(homeScreen);
    return;
  }
  navigation.navigate(
    target.screen as never,
    (target.params ?? undefined) as never,
  );
}
