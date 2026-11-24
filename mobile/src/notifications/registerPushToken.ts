import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as usersApi from '../api/users';
import * as chatApi from '../api/chat';
import { getActiveChatChannel } from './activeChatChannel';

const CHAT_REPLY_CATEGORY = 'chat_reply';
const CHAT_REPLY_ACTION = 'REPLY';

let replyListenerAttached = false;
let appStateListenerAttached = false;
let registerInFlight: Promise<void> | null = null;

// Best-effort: push notifications need a real device and an EAS project id.
// Any failure here should never block the app.
export async function registerPushTokenWithBackend() {
  if (Platform.OS === 'web') return;
  if (registerInFlight) return registerInFlight;
  registerInFlight = doRegister().finally(() => {
    registerInFlight = null;
  });
  return registerInFlight;
}

async function doRegister() {
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
        const isChatPush =
          data?.type === 'chat_unread' || data?.type === 'chat_mention';
        // Already staring at this thread — don't flash a system banner on top.
        // Otherwise always show the OS push (no in-app header toast anymore).
        const viewingThread =
          !!active && !!data?.channelKey && data.channelKey === active;
        const suppress = isChatPush && viewingThread;

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
      // MAX helps Xiaomi / older Androids that demote HIGH channels in the tray.
      const channel = {
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250] as number[],
        lightColor: '#c9ccd1',
        sound: 'default' as const,
        enableVibrate: true,
        showBadge: true,
      };
      await Notifications.setNotificationChannelAsync('chat', {
        name: 'Chat',
        ...channel,
      });
      await Notifications.setNotificationChannelAsync('default', {
        name: 'General',
        ...channel,
      });
      // "X is waiting in Team Voice" — separate channel so people can keep
      // voice pings on while muting chat (or the other way round).
      await Notifications.setNotificationChannelAsync('voice', {
        name: 'Voice channel',
        ...channel,
      });
      // Guild announcements from the owner. Its own channel so people can
      // mute chat and still hear "scrim in 10 minutes" — the whole point of
      // an announcement is that it is the one thing you do not want muted
      // along with everything else.
      await Notifications.setNotificationChannelAsync('announcements', {
        name: 'Guild announcements',
        ...channel,
      });
    }

    // Inline Reply on the notification shade (DM pushes set categoryId).
    await Notifications.setNotificationCategoryAsync(CHAT_REPLY_CATEGORY, [
      {
        identifier: CHAT_REPLY_ACTION,
        buttonTitle: 'Reply',
        textInput: {
          submitButtonTitle: 'Send',
          placeholder: 'Message…',
        },
        options: {
          opensAppToForeground: false,
        },
      },
    ]);
    attachReplyListener(Notifications);

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
    ensureAppStateReregister();
  } catch (err) {
    console.warn('Push notification registration skipped:', err);
  }
}

/**
 * Best-effort: remove this device's Expo token from the signed-in user before
 * logout. Must run while the JWT is still valid. Failures never block logout.
 */
export async function unregisterPushTokenFromBackend() {
  if (Platform.OS === 'web') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as
      | string
      | undefined;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    await usersApi.clearPushToken(tokenResponse.data);
  } catch (err) {
    console.warn('Push notification unregister skipped:', err);
  }
}

/** Old Android (MIUI etc.) often drops FCM until the app is foregrounded again. */
function ensureAppStateReregister() {
  if (appStateListenerAttached || Platform.OS === 'web') return;
  appStateListenerAttached = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void registerPushTokenWithBackend();
  });
}

function attachReplyListener(
  Notifications: typeof import('expo-notifications'),
) {
  if (replyListenerAttached) return;
  replyListenerAttached = true;
  Notifications.addNotificationResponseReceivedListener((response) => {
    const actionId = response.actionIdentifier;
    if (actionId !== CHAT_REPLY_ACTION) return;
    const data = response.notification.request.content.data as
      | { channelKey?: string; type?: string }
      | undefined;
    const channelKey =
      typeof data?.channelKey === 'string' ? data.channelKey : null;
    const userText =
      // expo-notifications types this as `userText` on the response.
      (response as { userText?: string }).userText?.trim() || '';
    if (!channelKey || !userText) return;
    void chatApi
      .sendChatMessage({ channelKey, text: userText })
      .catch((err) => console.warn('Notification reply failed:', err));
  });
}
