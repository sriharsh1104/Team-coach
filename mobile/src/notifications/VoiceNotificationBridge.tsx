import { useCallback, useEffect } from 'react';
import { Linking, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { parseVoiceDeepLink, requestOpenVoice, subscribeOpenVoice } from './openVoiceChannel';

/** Process-wide so remounts don't re-open the same notification / link. */
const handledKeys = new Set<string>();
let initialUrlChecked = false;
let linkListenerInstalled = false;

function handleIncomingUrl(url: string | null | undefined) {
  const req = parseVoiceDeepLink(url);
  if (!req) return;
  requestOpenVoice(req);
}

function ensureLinkListener() {
  if (linkListenerInstalled) return;
  linkListenerInstalled = true;
  Linking.addEventListener('url', ({ url }) => handleIncomingUrl(url));
}
ensureLinkListener();

/**
 * Renders nothing. Opens Team / Guild Voice when the user taps the ongoing
 * "In voice" notification (deep link) or a `teamcoach://voice/...` URL.
 */
export function VoiceNotificationBridge() {
  const navigation = useNavigation<any>();

  const openVoice = useCallback(
    (room: 'team' | 'guild') => {
      try {
        navigation.navigate(room === 'guild' ? 'GuildVoice' : 'Voice');
      } catch {
        // Navigator not ready / Voice unavailable on this stack.
      }
    },
    [navigation],
  );

  useEffect(() => {
    return subscribeOpenVoice((req) => openVoice(req.room));
  }, [openVoice]);

  useEffect(() => {
    if (!initialUrlChecked) {
      initialUrlChecked = true;
      Linking.getInitialURL()
        .then(handleIncomingUrl)
        .catch(() => undefined);
    }
  }, []);

  // Cold-start / background tap of the ongoing-call notification may also
  // surface through expo-notifications when the launch Intent carries data.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let remove: (() => void) | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Notifications = require('expo-notifications') as typeof import('expo-notifications');
      const handle = (response: {
        notification: { request: { identifier: string; content: { data?: Record<string, unknown> } } };
      } | null | undefined) => {
        if (!response) return;
        const data = response.notification.request.content.data;
        const roomRaw = data?.voiceRoom ?? data?.room;
        if (data?.type !== 'voice_keepalive' && typeof roomRaw !== 'string') return;
        const room = roomRaw === 'guild' ? 'guild' : roomRaw === 'team' ? 'team' : null;
        if (!room) return;
        const key = `voice-push:${response.notification.request.identifier}`;
        if (handledKeys.has(key)) return;
        handledKeys.add(key);
        openVoice(room);
      };
      // Only honor a tap from the last ~45s. Replaying an old response on
      // every cold start / login used to dump people into Voice for no reason.
      void Notifications.getLastNotificationResponseAsync?.()
        .then((response) => {
          const date = (response as { notification?: { date?: number } } | null)
            ?.notification?.date;
          if (typeof date === 'number' && Date.now() - date > 45_000) return;
          handle(response);
        })
        .catch(() => undefined);
      const sub = Notifications.addNotificationResponseReceivedListener(handle);
      remove = () => sub.remove();
    } catch {
      // expo-notifications unavailable — deep link path still works.
    }
    return () => remove?.();
  }, [openVoice]);

  return null;
}
