import { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import { requestOpenChat } from './openChatChannel';

/** Process-wide so remounts don't re-open the same notification. */
const handledKeys = new Set<string>();

type NotificationResponseLike = {
  actionIdentifier?: string;
  notification: {
    request: {
      identifier: string;
      content: { data?: Record<string, unknown> };
    };
  };
};

function isChatPush(data: Record<string, unknown> | undefined): data is {
  type: string;
  channelKey: string;
  senderName?: string;
  senderId?: string;
} {
  if (!data) return false;
  if (data.type !== 'chat_unread' && data.type !== 'chat_mention') return false;
  return typeof data.channelKey === 'string' && data.channelKey.length > 0;
}

/**
 * Renders nothing. Lives inside the signed-in navigator and opens the matching
 * chat when the user taps a chat push (not the inline Reply action — that is
 * handled in registerPushToken).
 */
export function ChatNotificationBridge() {
  const navigation = useNavigation<any>();
  const { org } = useAuth();

  const openFromPush = useCallback(
    (data: {
      channelKey: string;
      senderName?: string;
      senderId?: string;
    }) => {
      requestOpenChat({
        channelKey: data.channelKey,
        title: data.senderName,
        senderId: data.senderId,
      });
      // ChatHub lives on OrgHome (roster) or GuildHome (guild-only).
      try {
        navigation.navigate(org ? 'OrgHome' : 'GuildHome');
      } catch {
        // Navigator not ready — pending openChat still fires when hub mounts.
      }
    },
    [org, navigation],
  );

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let remove: (() => void) | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Notifications = require('expo-notifications') as typeof import('expo-notifications');
      const handle = (response: NotificationResponseLike | null | undefined) => {
        if (!response) return;
        // Inline Reply is handled separately — don't also jump into the chat.
        const action = response.actionIdentifier;
        if (
          action &&
          action !== Notifications.DEFAULT_ACTION_IDENTIFIER &&
          action !== 'expo.modules.notifications.actions.DEFAULT'
        ) {
          return;
        }
        const data = response.notification.request.content.data;
        if (!isChatPush(data)) return;
        const key = `chat-push:${response.notification.request.identifier}`;
        if (handledKeys.has(key)) return;
        handledKeys.add(key);
        openFromPush({
          channelKey: data.channelKey,
          senderName:
            typeof data.senderName === 'string' ? data.senderName : undefined,
          senderId: typeof data.senderId === 'string' ? data.senderId : undefined,
        });
        void Notifications.clearLastNotificationResponseAsync?.().catch(
          () => undefined,
        );
      };
      void Notifications.getLastNotificationResponseAsync?.()
        .then(handle)
        .catch(() => undefined);
      const sub = Notifications.addNotificationResponseReceivedListener(handle);
      remove = () => sub.remove();
    } catch {
      // expo-notifications unavailable (web / tests).
    }
    return () => remove?.();
  }, [openFromPush]);

  return null;
}
