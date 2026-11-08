import { useEffect, useRef } from 'react';
import { Alert, BackHandler, Platform } from 'react-native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';

/**
 * On the stack root (OrgHome / GuildHome), Android hardware back shows an
 * exit confirm. Yes finishes the app; No stays. While focused we consume
 * the press so the activity does not background without asking.
 */
export function useBlockExitOnRoot(
  navigation: NavigationProp<ParamListBase>,
) {
  const promptingRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    let backSub: { remove: () => void } | null = null;

    const onBack = () => {
      if (promptingRef.current) return true;
      promptingRef.current = true;
      Alert.alert(
        'Exit app?',
        'Do you want to exit?',
        [
          {
            text: 'No',
            style: 'cancel',
            onPress: () => {
              promptingRef.current = false;
            },
          },
          {
            text: 'Yes',
            style: 'destructive',
            onPress: () => {
              promptingRef.current = false;
              BackHandler.exitApp();
            },
          },
        ],
        {
          cancelable: true,
          onDismiss: () => {
            promptingRef.current = false;
          },
        },
      );
      return true;
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
}
