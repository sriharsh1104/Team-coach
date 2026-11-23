import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { AudioSession } from '@livekit/react-native';
import {
  AudioOutputId,
  isAudioOutputId,
  keepManualSelection,
  preferredCallDefault,
  resolveActiveOutput,
  sortAudioOutputs,
} from './audioOutputs';

/**
 * Android has no "devices changed" callback we can subscribe to (LiveKit's
 * devicesUpdated event is iOS/macOS only), so the list is polled while the
 * user can actually see it. Plugging in headphones mid-call should show up
 * within a beat, not on the next screen open.
 */
const POLL_MS = 2_500;

export type AudioOutputState = {
  /** Routes the OS is offering right now, best-first. */
  outputs: AudioOutputId[];
  /** What is playing: the manual pick, else the automatic choice. */
  active: AudioOutputId | null;
  /** True once the user has overridden the automatic routing. */
  isManual: boolean;
  select: (id: AudioOutputId) => void;
  /** iOS only: the system AirPlay / route sheet. */
  openSystemPicker: (() => void) | null;
};

/**
 * In-call audio output switching (speaker / earpiece / wired / bluetooth).
 * Defaults to the phone earpiece for call-style audio; a tap flips to
 * speaker, and external devices appear in the picker when connected.
 *
 * `active` must only be enabled while an AudioSession is running —
 * getAudioOutputs() needs startAudioSession() to have been called, which the
 * voice hooks do on join.
 */
export function useAudioOutput(enabled: boolean): AudioOutputState {
  const [outputs, setOutputs] = useState<AudioOutputId[]>([]);
  const [manual, setManual] = useState<AudioOutputId | null>(null);
  const manualRef = useRef<AudioOutputId | null>(null);
  const appliedDefaultRef = useRef(false);
  manualRef.current = manual;

  const refresh = useCallback(async () => {
    try {
      const raw = await AudioSession.getAudioOutputs();
      const next = sortAudioOutputs(raw.filter(isAudioOutputId));
      setOutputs((prev) =>
        prev.length === next.length && prev.every((id, i) => id === next[i])
          ? prev
          : next,
      );
      // Headphones pulled out → drop the manual pick so routing (and the
      // button's icon) follow the OS again instead of pointing at nothing.
      setManual((prev) => keepManualSelection(next, prev));

      // First time we see routes in this call: pin to earpiece (call default)
      // unless a headset / bluetooth device is already connected.
      if (!appliedDefaultRef.current && next.length > 0 && !manualRef.current) {
        const preferred = preferredCallDefault(next);
        appliedDefaultRef.current = true;
        if (preferred) {
          setManual(preferred);
          AudioSession.selectAudioOutput(preferred).catch((err) => {
            console.warn('selectAudioOutput (default) failed:', err);
            setManual(null);
          });
        }
      }
    } catch {
      // No audio session yet, or the platform does not report outputs.
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setOutputs([]);
      setManual(null);
      appliedDefaultRef.current = false;
      return;
    }
    let cancelled = false;
    const tick = () => {
      if (!cancelled) void refresh();
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    const onAppState = (state: AppStateStatus) => {
      // Headphones are very often swapped while the app is in the background.
      if (state === 'active') tick();
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => {
      cancelled = true;
      clearInterval(id);
      sub.remove();
    };
  }, [enabled, refresh]);

  const select = useCallback((id: AudioOutputId) => {
    // Optimistic: the button should flip under the finger, not after the
    // native round-trip. A failure falls back on the next poll.
    setManual(id);
    AudioSession.selectAudioOutput(id).catch((err) => {
      console.warn('selectAudioOutput failed:', err);
      setManual((prev) => (prev === id ? null : prev));
    });
  }, []);

  const openSystemPicker = useCallback(() => {
    AudioSession.showAudioRoutePicker().catch((err) => {
      console.warn('showAudioRoutePicker failed:', err);
    });
  }, []);

  return {
    outputs,
    active: resolveActiveOutput(outputs, manual),
    isManual: manual !== null,
    select,
    openSystemPicker: Platform.OS === 'ios' ? openSystemPicker : null,
  };
}
