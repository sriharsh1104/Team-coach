import { useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getToken } from '../storage/tokenStorage';
import { connectChatSocket, disconnectChatSocket } from '../api/chat';

/**
 * Keeps one chat socket open for the whole signed-in session (inside an org),
 * not per chat screen. Messages then arrive live while the app is open, and
 * opening a chat no longer waits for a new handshake. Closed on sign-out.
 *
 * No in-app header toast — chat alerts while the app is open/backgrounded
 * come from Expo push banners only.
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

  useEffect(() => () => disconnectChatSocket(), []);
}
