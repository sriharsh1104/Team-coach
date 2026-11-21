import { useEffect } from 'react';
import { AppState } from 'react-native';
import { apiBaseUrl } from '../api/client';
import { isOnline } from '../net/networkStatus';

const PING_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Pings the backend /health endpoint every 10 minutes while the app is in
 * the foreground, preventing Render's free tier from spinning down after
 * 15 min of inactivity.
 *
 * This deliberately runs signed out as well: someone sitting on the login
 * screen is exactly the person about to pay for a cold start.
 */
export function useServerWakePing() {
  useEffect(() => {
    const ping = () => {
      if (!isOnline()) return;
      fetch(`${apiBaseUrl}/health`, { method: 'GET' }).catch(() => {});
    };

    // Immediate ping on mount
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
  }, []);
}
