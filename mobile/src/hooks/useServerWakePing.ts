import { useEffect } from 'react';
import { AppState } from 'react-native';
import { apiBaseUrl } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const PING_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Pings the backend /health endpoint every 10 minutes while the user is
 * logged in and the app is in the foreground, preventing Render's free tier
 * from spinning down after 15 min of inactivity.
 */
export function useServerWakePing() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const ping = () => {
      fetch(`${apiBaseUrl}/health`, { method: 'GET' }).catch(() => {});
    };

    // Immediate ping on login/mount
    ping();

    const id = setInterval(ping, PING_INTERVAL_MS);

    // Also ping on app foreground so the first request after backgrounding
    // doesn't hang while the server wakes up.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') ping();
    });

    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [!!user]); // eslint-disable-line react-hooks/exhaustive-deps
}
