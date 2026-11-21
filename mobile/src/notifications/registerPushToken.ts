import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as usersApi from '../api/users';
import * as chatApi from '../api/chat';
import { getActiveChatChannel } from './activeChatChannel';
import { isChatSocketConnected } from '../api/chat';

const CHAT_REPLY_CATEGORY = 'chat_reply';
const CHAT_REPLY_ACTION = 'REPLY';

let replyListenerAttached = false;

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
        const isChatPush =
          data?.type === 'chat_unread' || data?.type === 'chat_mention';
        // Already staring at this thread — don't flash a banner on top.
        const viewingThread =
          !!active && !!data?.channelKey && data.channelKey === active;
        // Foreground + live socket: the in-app bubble already shows the
        // message, so skip a duplicate tray banner for Team/Guild (DMs still
        // need their push — they don't hit the app-level socket the same way).
        // Socket alone is NOT enough: Android keeps the process/socket alive
        // in the background, and that used to swallow Team/Guild pushes while
        // 1:1 still arrived.
        const groupChannel =
          data?.channelKey === 'org' || data?.channelKey === 'guild';
        const appInForeground = AppState.currentState === 'active';
        const liveInApp =
          appInForeground && isChatSocketConnected() && groupChannel;
        const suppress = isChatPush && (viewingThread || liveInApp);

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
  } catch (err) {
    console.warn('Push notification registration skipped:', err);
  }
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
