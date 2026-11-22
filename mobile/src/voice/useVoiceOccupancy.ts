import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as voiceApi from '../api/voice';
import type { VoiceRoomKind } from '../api/voice';
import type { VoiceOccupancy } from '../api/types';

const POLL_MS = 10_000;

const EMPTY: VoiceOccupancy = {
  room: 'team',
  max: 0,
  count: 0,
  participants: [],
};

/**
 * Polls who is already in a voice room without joining.
 * Used by the voice lobby and the chat headset indicator.
 */
export function useVoiceOccupancy(
  room: VoiceRoomKind | null,
  opts: { enabled?: boolean } = {},
) {
  const enabled = opts.enabled !== false && room != null;
  const [occupancy, setOccupancy] = useState<VoiceOccupancy>(EMPTY);
  const roomRef = useRef(room);
  roomRef.current = room;

  const refresh = useCallback(async () => {
    const kind = roomRef.current;
    if (!kind) return;
    try {
      const next = await voiceApi.getVoiceOccupancy(kind);
      if (roomRef.current === kind) setOccupancy(next);
    } catch {
      // Keep last known occupancy on transient failures.
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setOccupancy(EMPTY);
      return;
    }
    let cancelled = false;
    const tick = () => {
      if (!cancelled) void refresh();
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') tick();
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => {
      cancelled = true;
      clearInterval(id);
      sub.remove();
    };
  }, [enabled, room, refresh]);

  return { occupancy, refresh };
}
