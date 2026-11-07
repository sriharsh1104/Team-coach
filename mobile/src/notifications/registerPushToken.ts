import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as usersApi from '../api/users';
import { getActiveChatChannel } from './activeChatChannel';

// Best-effort: push notifications need a real device and an EAS project id.
// Any failure here should never block the app.
export async function registerPushTokenWithBackend() {
  if (Platform.OS === 'web') return;

  try {
    // require (not dynamic import) — Metro/tsc module settings vary across CI.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = notification.request.content.data as
          | { channelKey?: string; type?: string }
          | undefined;
        const active = getActiveChatChannel();
        // Already staring at this thread — don't flash a banner on top.
        const suppress =
          !!active &&
          !!data?.channelKey &&
          data.channelKey === active &&
          (data.type === 'chat_unread' || data.type === 'chat_mention');

        return {
          shouldShowAlert: !suppress,
          shouldPlaySound: !suppress,
          shouldSetBadge: true,
          shouldShowBanner: !suppress,
          shouldShowList: !suppress,
        };
      },
    });

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('chat', {
        name: 'Chat',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#c9ccd1',
        sound: 'default',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as
      | string
      | undefined;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    await usersApi.setPushToken(tokenResponse.data);
  } catch (err) {
    console.warn('Push notification registration skipped:', err);
  }
}
