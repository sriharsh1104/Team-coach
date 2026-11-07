import { CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from './types';

/**
 * Drawer navigation (OrgHome/GuildHome sidebar) always resets the stack to
 * a clean [home, target] instead of pushing onto whatever screen happens to
 * be open. A plain navigate() pushes onto the CURRENT screen when the
 * target isn't already in the stack, which silently piles up intermediate
 * screens — e.g. Roster -> Maps (via the drawer) leaves Roster underneath,
 * so Maps's back button goes to Roster instead of straight to Chat, and the
 * stack keeps growing every time the drawer is used to jump sections.
 */
export function goToSection<RouteName extends keyof MainStackParamList>(
  navigation: NativeStackNavigationProp<MainStackParamList, RouteName>,
  homeScreen: 'OrgHome' | 'GuildHome',
  target?: { screen: keyof MainStackParamList; params?: object },
) {
  navigation.dispatch(
    CommonActions.reset({
      index: target ? 1 : 0,
      routes: target
        ? [{ name: homeScreen }, { name: target.screen as string, params: target.params }]
        : [{ name: homeScreen }],
    }),
  );
}
