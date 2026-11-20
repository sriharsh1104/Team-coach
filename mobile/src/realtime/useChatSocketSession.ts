import { useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getToken } from '../storage/tokenStorage';
import {
  connectChatSocket,
  disconnectChatSocket,
  subscribeChatMessages,
} from '../api/chat';
import { getActiveChatChannel } from '../notifications/activeChatChannel';
import { emitToast } from '../ui/toastBus';

const CHANNEL_LABEL: Record<string, string> = {
  org: 'Team Chat',
  guild: 'Guild Chat',
};

/**
 * Keeps one chat socket open for the whole signed-in session (inside an org),
 * not per chat screen. Messages then arrive live while the app is open, and
 * opening a chat no longer waits for a new handshake. Closed on sign-out.
 * Background notifications still come from Expo push when the app is closed.
 */
export function useChatSocketSession() {
  const { user, org } = useAuth();
  const ready = !!user && !!org;
  const userId = user?.id ?? null;
  const orgId = org?.id ?? null;

  useEffect(() => {
    if (!ready) {
      disconnectChatSocket();
      return;
    }
    let cancelled = false;
    void getToken().then((token) => {
      if (token && !cancelled) connectChatSocket(token);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, userId, orgId]);

  // App open, but not looking at that chat: show an in-app alert right away.
  // (Push still covers the app-closed / background case.)
  useEffect(() => {
    if (!ready || !userId) return;
    return subscribeChatMessages((message) => {
      if (message.senderId === userId) return;
      if (message.channelKey && message.channelKey === getActiveChatChannel()) return;
      const who = message.senderName || 'Teammate';
      const where =
        message.channelKey && CHANNEL_LABEL[message.channelKey]
          ? ` · ${CHANNEL_LABEL[message.channelKey]}`
          : '';
      const body = message.text
        ? message.text
        : message.mediaType === 'VIDEO'
          ? 'Sent a video'
          : message.mediaType === 'IMAGE'
            ? 'Sent a photo'
            : 'New message';
      emitToast(`${who}${where}: ${body}`, 3500);
    });
  }, [ready, userId]);

  useEffect(() => () => disconnectChatSocket(), []);
}
