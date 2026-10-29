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
  const { user, org } = useAuth();
  const listeners = useRef(new Set<Listener>());
  const [lastEvent, setLastEvent] = useState<OrgRealtimeEvent | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emit = useCallback((event: OrgRealtimeEvent) => {
    if (event.type === 'heartbeat') return;
    if (event.type === 'stats.changed') cacheInvalidate('stats:');
    if (event.type === 'media.changed') cacheInvalidate('media:');
    if (event.type === 'scrims.changed') {
      cacheInvalidate(CacheKeys.scrimsList());
      cacheInvalidate('stats:');
    }
    setLastEvent(event);
    listeners.current.forEach((fn) => fn(event));
  }, []);

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!user || !org) return;

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
  }, [user, org, emit]);

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
