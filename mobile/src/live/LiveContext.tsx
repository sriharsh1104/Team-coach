import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';
import { isScreenRecording } from '../media/screenRecorder';
import {
  addLiveErrorListener,
  addLiveStartedListener,
  addLiveStoppedListener,
  isLiveStreaming,
  startLiveStream,
  stopLiveStream,
} from '../media/liveStreamer';
import { emitToast } from '../ui/toastBus';

type LiveCtx = {
  live: boolean;
  elapsedSec: number;
  starting: boolean;
  startLive: (opts: { rtmpUrl: string; streamKey: string }) => Promise<boolean>;
  stopLive: () => Promise<void>;
};

const LiveContext = createContext<LiveCtx>({
  live: false,
  elapsedSec: 0,
  starting: false,
  startLive: async () => false,
  stopLive: async () => undefined,
});

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const [live, setLive] = useState(() => isLiveStreaming());
  const [starting, setStarting] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startEpochRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const beginTimer = useCallback(() => {
    clearTimer();
    startEpochRef.current = Date.now();
    setElapsedSec(0);
    timerRef.current = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startEpochRef.current) / 1000));
    }, 1000);
  }, [clearTimer]);

  useEffect(() => {
    const unsubStart = addLiveStartedListener(() => {
      setLive(true);
      setStarting(false);
      beginTimer();
    });
    const unsubStop = addLiveStoppedListener((error) => {
      setLive(false);
      setStarting(false);
      clearTimer();
      setElapsedSec(0);
      if (error) emitToast(error);
    });
    const unsubErr = addLiveErrorListener((message) => {
      setStarting(false);
      emitToast(message);
    });
    return () => {
      unsubStart();
      unsubStop();
      unsubErr();
      clearTimer();
    };
  }, [beginTimer, clearTimer]);

  // Resync if the user killed the notification while backgrounded.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const still = isLiveStreaming();
      setLive(still);
      if (!still) {
        clearTimer();
        setElapsedSec(0);
        setStarting(false);
      }
    });
    return () => sub.remove();
  }, [clearTimer]);

  const startLive = useCallback(
    async (opts: { rtmpUrl: string; streamKey: string }) => {
      if (Platform.OS !== 'android') {
        emitToast('Go Live is only on Android');
        return false;
      }
      if (isScreenRecording()) {
        emitToast('Stop screen recording before going live');
        return false;
      }
      if (isLiveStreaming() || starting) return true;
      setStarting(true);
      try {
        const result = await startLiveStream(opts);
        if (result === 'unsupported') {
          setStarting(false);
          emitToast('Go Live is only on Android');
          return false;
        }
        if (result === 'unavailable') {
          setStarting(false);
          emitToast('Rebuild the Android app to enable Go Live');
          return false;
        }
        // Native resolves after permission + connect; onStarted also fires.
        return true;
      } catch (err: any) {
        setStarting(false);
        emitToast(err?.message || 'Could not start live');
        return false;
      }
    },
    [starting],
  );

  const stopLive = useCallback(async () => {
    try {
      await stopLiveStream();
    } catch {
      emitToast('Could not stop live');
    }
    setLive(false);
    setStarting(false);
    clearTimer();
    setElapsedSec(0);
  }, [clearTimer]);

  return (
    <LiveContext.Provider value={{ live, elapsedSec, starting, startLive, stopLive }}>
      {children}
    </LiveContext.Provider>
  );
}

export function useLive() {
  return useContext(LiveContext);
}
