import { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';

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

function isAnnouncementPush(
  data: Record<string, unknown> | undefined,
): data is { type: string; announcementId: string } {
  return !!data && data.type === 'announcement';
}

/**
 * Renders nothing. Opens the Announcements screen when someone taps a guild
 * announcement push — same shape as ChatNotificationBridge, kept separate so
 * neither has to know about the other's payloads.
 */
export function AnnouncementNotificationBridge() {
  const navigation = useNavigation<any>();
  const { org } = useAuth();

  const open = useCallback(() => {
    try {
      // Announcements hangs off OrgHome (roster) or GuildHome (guild-only),
      // the same split the chat bridge uses.
      navigation.navigate(org ? 'OrgHome' : 'GuildHome');
      navigation.navigate('Announcements');
    } catch {
      // Navigator not ready yet — the drawer badge still shows the unread.
    }
  }, [navigation, org]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let remove: (() => void) | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Notifications =
        require('expo-notifications') as typeof import('expo-notifications');
      const handle = (
        response: NotificationResponseLike | null | undefined,
      ) => {
        if (!response) return;
        // Only a plain tap. Announcements carry no action buttons, but a
        // future one must not also jump into the screen.
        const action = response.actionIdentifier;
        if (
          action &&
          action !== Notifications.DEFAULT_ACTION_IDENTIFIER &&
          action !== 'expo.modules.notifications.actions.DEFAULT'
        ) {
          return;
        }
        const data = response.notification.request.content.data;
        if (!isAnnouncementPush(data)) return;
        const key = `announcement-push:${response.notification.request.identifier}`;
        if (handledKeys.has(key)) return;
        handledKeys.add(key);
        open();
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
  }, [open]);

  return null;
}
