import { useCallback, useEffect } from 'react';
import { Alert, Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useGamesSocket } from './useGamesSocket';
import { parseGameRoomLink } from './gameLinks';

/** Process-wide so a remount (account switch, phase change) never re-opens the same invite. */
const handledKeys = new Set<string>();
let initialUrlChecked = false;

type NotificationResponseLike = {
  actionIdentifier?: string;
  notification: {
    request: {
      identifier: string;
      content: { data?: Record<string, unknown> };
    };
  };
};

/**
 * Renders nothing. Lives inside the NavigationContainer (signed-in, in an org)
 * and turns game invites into "Join" taps from every entry point:
 *  - live `room:invite` socket event (also delivers invites queued while you
 *    were offline, right after you open the app),
 *  - tapping the push notification (`type: 'game_invite'`),
 *  - a shared `teamcoach://games/room/<id>` link (WhatsApp / Discord message).
 */
export function GameInviteBridge() {
  const navigation = useNavigation<any>();

  const openRoom = useCallback(
    (roomId: string, game?: string) => {
      try {
        navigation.navigate('GameRoom', { roomId, game });
      } catch {
        // Navigator not ready / route unavailable in this phase — ignore.
      }
    },
    [navigation],
  );

  useGamesSocket({
    onInvite: ({ room, from }) => {
      const key = `invite:${room.id}:${from.userId}`;
      if (handledKeys.has(key)) return;
      handledKeys.add(key);
      Alert.alert(`${from.name} invited you`, `Join their ${room.title} room?`, [
        { text: 'Not now', style: 'cancel' },
        { text: 'Join', onPress: () => openRoom(room.id, room.game) },
      ]);
    },
  });

  // Shared link (cold start + while running).
  useEffect(() => {
    const handle = (url: string | null) => {
      const roomId = parseGameRoomLink(url);
      if (roomId) openRoom(roomId);
    };
    if (!initialUrlChecked) {
      initialUrlChecked = true;
      Linking.getInitialURL()
        .then(handle)
        .catch(() => undefined);
    }
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, [openRoom]);

  // Tapping the "X invited you to play" push notification.
  useEffect(() => {
    let remove: (() => void) | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Notifications = require('expo-notifications') as typeof import('expo-notifications');
      const handle = (response: NotificationResponseLike | null | undefined) => {
        if (!response) return;
        const data = response.notification.request.content.data;
        if (data?.type !== 'game_invite' || typeof data.roomId !== 'string') return;
        const key = `push:${response.notification.request.identifier}`;
        if (handledKeys.has(key)) return;
        handledKeys.add(key);
        openRoom(data.roomId, typeof data.game === 'string' ? data.game : undefined);
      };
      void Notifications.getLastNotificationResponseAsync?.()
        .then(handle)
        .catch(() => undefined);
      const sub = Notifications.addNotificationResponseReceivedListener(handle);
      remove = () => sub.remove();
    } catch {
      // expo-notifications unavailable (web / tests) — invites still arrive live.
    }
    return () => remove?.();
  }, [openRoom]);

  return null;
}
