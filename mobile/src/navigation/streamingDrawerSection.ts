import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SideDrawerSection } from '../ui/SideDrawer';
import { goToSection } from './goToSection';
import type { MainStackParamList } from './types';

type Home = 'OrgHome' | 'GuildHome';
type MainNav = NativeStackNavigationProp<
  MainStackParamList,
  keyof MainStackParamList
>;

/**
 * Sidebar group for Go Live, screen Recorder, and (soon) content Edit.
 * Replaces the old separate Live + Tools sections.
 */
export function streamingDrawerSection(
  navigation: MainNav,
  home: Home,
  startRecording: () => void,
): SideDrawerSection {
  return {
    key: 'streaming',
    label: 'Streaming & Content Tools',
    split: true,
    items: [
      {
        key: 'goLive',
        label: 'Go Live',
        icon: 'play',
        onPress: () => goToSection(navigation, home, { screen: 'GoLive' }),
      },
      {
        key: 'recorder',
        label: 'Recorder',
        icon: 'videocam-outline',
        onPress: () => startRecording(),
      },
      {
        key: 'contentEdit',
        label: 'Edit',
        icon: 'pencil-outline',
        onPress: () =>
          goToSection(navigation, home, { screen: 'ContentEdit' }),
      },
    ],
  };
}
