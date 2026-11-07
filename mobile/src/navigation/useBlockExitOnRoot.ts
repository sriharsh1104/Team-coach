import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';

/**
 * On the stack root (OrgHome / GuildHome), Android's hardware back would
 * finish the activity / send the app to background. While this screen is
 * focused, consume that press so back only pops when there is actually
 * somewhere to go — matching the history kept by goToSection.
 */
export function useBlockExitOnRoot(
  navigation: NavigationProp<ParamListBase>,
) {
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    let backSub: { remove: () => void } | null = null;

    const enable = () => {
      if (backSub) return;
      backSub = BackHandler.addEventListener('hardwareBackPress', () => true);
    };
    const disable = () => {
      backSub?.remove();
      backSub = null;
    };

    const unFocus = navigation.addListener('focus', enable);
    const unBlur = navigation.addListener('blur', disable);

    // Initial route is already focused before listeners attach.
    if (typeof navigation.isFocused === 'function' && navigation.isFocused()) {
      enable();
    }

    return () => {
      unFocus();
      unBlur();
      disable();
    };
  }, [navigation]);
}
