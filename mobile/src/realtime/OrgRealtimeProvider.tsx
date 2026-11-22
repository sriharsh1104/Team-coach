import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { getToken } from '../storage/tokenStorage';
import { cacheInvalidate, CacheKeys } from '../api/queryCache';
import { connectOrgSse, OrgRealtimeEvent } from './sseClient';

type Listener = (event: OrgRealtimeEvent) => void;

type OrgRealtimeContextValue = {
  /** Subscribe to org push events (stats/media/scrims). Returns unsubscribe. */
  subscribe: (listener: Listener) => () => void;
  lastEvent: OrgRealtimeEvent | null;
};

const OrgRealtimeContext = createContext<OrgRealtimeContextValue | null>(null);

/**
 * Keeps one SSE connection while the user is in an org. On push events,
 * invalidates the matching query-cache prefix so screens refetch once.
 */
export function OrgRealtimeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, org, guild, refreshOrg } = useAuth();
  const listeners = useRef(new Set<Listener>());
  const [lastEvent, setLastEvent] = useState<OrgRealtimeEvent | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emit = useCallback(
    (event: OrgRealtimeEvent) => {
      if (event.type === 'heartbeat') return;
      if (event.type === 'stats.changed') cacheInvalidate('stats:');
      if (event.type === 'media.changed') cacheInvalidate('media:');
      if (event.type === 'members.changed') cacheInvalidate('org:');
      if (event.type === 'membership.changed') {
        // Our own seat moved: accepted into a guild, added to or dropped from
        // the roster. Re-reading /auth/me swaps org/guild in AuthContext,
        // which is what moves RootNavigator between the auth / guild / main
        // stacks and redraws the sidebar — the part that used to need the app
        // to be closed and reopened.
        cacheInvalidate('org:');
        void refreshOrg().catch(() => undefined);
      }
      if (event.type === 'scrims.changed') {
        cacheInvalidate(CacheKeys.scrimsList());
        cacheInvalidate('stats:');
      }
      setLastEvent(event);
      listeners.current.forEach((fn) => fn(event));
    },
    [refreshOrg],
  );

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    // Signed in is enough. The stream carries a personal channel as well as
    // the org one, so a guild-only member — or someone with no seat at all,
    // waiting on a join request — still gets told the moment that changes.
    if (!user) return;

    let cancelled = false;

    const disconnect = () => {
      stopRef.current?.();
      stopRef.current = null;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    };

    const connect = async () => {
      const token = await getToken();
      if (!token || cancelled) return;
      disconnect();
      stopRef.current = connectOrgSse(
        token,
        (event) => emit(event),
        () => {
          if (cancelled) return;
          reconnectTimer.current = setTimeout(() => {
            void connect();
          }, 2500);
        },
      );
    };

    void connect();

    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') void connect();
      if (state === 'background') disconnect();
    };
    const sub = AppState.addEventListener('change', onAppState);

    return () => {
      cancelled = true;
      disconnect();
      sub.remove();
    };
    // org/guild in the deps: re-opening the stream after a seat change
    // re-resolves which org channel to listen on.
  }, [user, org, guild, emit]);

  const value = useMemo(
    () => ({ subscribe, lastEvent }),
    [subscribe, lastEvent],
  );

  return (
    <OrgRealtimeContext.Provider value={value}>
      {children}
    </OrgRealtimeContext.Provider>
  );
}

export function useOrgRealtime() {
  const ctx = useContext(OrgRealtimeContext);
  if (!ctx) {
    throw new Error('useOrgRealtime must be used within OrgRealtimeProvider');
  }
  return ctx;
}

/** Optional hook — no-op outside provider (safe for isolated unit tests). */
export function useOrgRealtimeOptional() {
  return useContext(OrgRealtimeContext);
}
