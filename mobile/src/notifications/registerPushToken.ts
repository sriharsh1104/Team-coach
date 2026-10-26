import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as usersApi from '../api/users';

// Best-effort: push notifications need a real device and (for a standalone
// build later) an EAS project id. Any failure here should never block the app —
// it just means the coach won't get a push for this session until it's set up.
export async function registerPushTokenWithBackend() {
  if (Platform.OS === 'web') return;

  try {
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
