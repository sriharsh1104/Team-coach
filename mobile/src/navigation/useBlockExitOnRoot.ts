import { useEffect, useRef, useState } from 'react';
import { BackHandler, Platform } from 'react-native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';

/**
 * On the stack root (OrgHome / GuildHome), Android hardware back shows a
 * themed exit-confirm dialog instead of the system Alert.
 *
 * Returns `{ exitModalVisible, confirmExit, cancelExit }` — render
 * `<ExitConfirmModal>` in the host component and wire these props to it.
 */
export function useBlockExitOnRoot(navigation: NavigationProp<ParamListBase>) {
  const [exitModalVisible, setExitModalVisible] = useState(false);
  const promptingRef = useRef(false);

  const cancelExit = () => {
    promptingRef.current = false;
    setExitModalVisible(false);
  };

  const confirmExit = () => {
    promptingRef.current = false;
    setExitModalVisible(false);
    if (Platform.OS === 'android') BackHandler.exitApp();
  };

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    let backSub: { remove: () => void } | null = null;

    const onBack = () => {
      if (promptingRef.current) return true;
      promptingRef.current = true;
      setExitModalVisible(true);
      return true; // consume event — don't background the app
    };

    const enable = () => {
      if (backSub) return;
      backSub = BackHandler.addEventListener('hardwareBackPress', onBack);
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

  return { exitModalVisible, confirmExit, cancelExit };
}
