import { useEffect } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';

/**
 * Request all permissions the app needs on first launch, before the user
 * reaches any screen that requires them. Call once from the top-level App.
 */
export function useAppPermissions() {
  useEffect(() => {
    requestAllPermissions();
  }, []);
}

async function requestAllPermissions() {
  try {
    // Push notifications — works on both platforms via expo-notifications.
    await Notifications.requestPermissionsAsync();
  } catch {
    // Non-fatal: app works without push.
  }

  try {
    // Microphone — needed for Team Voice.
    if (Platform.OS === 'android') {
      await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Access',
          message:
            'Sacred Team Coach needs your microphone so you can talk with your team in voice channels.',
          buttonPositive: 'Allow',
          buttonNegative: 'Not Now',
        },
      );
    } else {
      // iOS: system dialog shown by expo-av, same permission used by LiveKit.
      await Audio.requestPermissionsAsync();
    }
  } catch {
    // Non-fatal: voice will show its own error when the user tries to join.
  }
}
