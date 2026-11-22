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
  addLivePausedListener,
  addLiveStartedListener,
  addLiveStoppedListener,
  isLivePaused,
  isLiveStreaming,
  pauseLiveStream,
  resumeLiveStream,
  startLiveStream,
  stopLiveStream,
} from '../media/liveStreamer';
import { emitToast } from '../ui/toastBus';

export type LiveStartOpts = {
  rtmpUrl: string;
  streamKey: string;
  title?: string;
  bannerUri?: string | null;
};

type LiveCtx = {
  live: boolean;
  paused: boolean;
  elapsedSec: number;
  starting: boolean;
  title: string;
  bannerUri: string | null;
  startLive: (opts: LiveStartOpts) => Promise<boolean>;
  stopLive: () => Promise<void>;
  pauseLive: () => Promise<void>;
  resumeLive: () => Promise<void>;
};

const LiveContext = createContext<LiveCtx>({
  live: false,
  paused: false,
  elapsedSec: 0,
  starting: false,
  title: '',
  bannerUri: null,
  startLive: async () => false,
  stopLive: async () => undefined,
  pauseLive: async () => undefined,
  resumeLive: async () => undefined,
});

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const [live, setLive] = useState(() => isLiveStreaming());
  const [paused, setPaused] = useState(() => isLivePaused());
  const [starting, setStarting] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [title, setTitle] = useState('');
  const [bannerUri, setBannerUri] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startEpochRef = useRef(0);
  const pausedAccumRef = useRef(0);
  const pauseStartedRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const tickElapsed = useCallback(() => {
    const pauseExtra =
      pauseStartedRef.current != null
        ? Date.now() - pauseStartedRef.current
        : 0;
    const runningMs =
      Date.now() - startEpochRef.current - pausedAccumRef.current - pauseExtra;
    setElapsedSec(Math.max(0, Math.floor(runningMs / 1000)));
  }, []);

  const beginTimer = useCallback(() => {
    clearTimer();
    startEpochRef.current = Date.now();
    pausedAccumRef.current = 0;
    pauseStartedRef.current = null;
    setElapsedSec(0);
    timerRef.current = setInterval(tickElapsed, 1000);
  }, [clearTimer, tickElapsed]);

  useEffect(() => {
    const unsubStart = addLiveStartedListener(() => {
      setLive(true);
      setPaused(false);
      setStarting(false);
      beginTimer();
    });
    const unsubStop = addLiveStoppedListener((error) => {
      setLive(false);
      setPaused(false);
      setStarting(false);
      clearTimer();
      setElapsedSec(0);
      setTitle('');
      setBannerUri(null);
      if (error) emitToast(error);
    });
    const unsubErr = addLiveErrorListener((message) => {
      setStarting(false);
      emitToast(message);
    });
    const unsubPause = addLivePausedListener((isPaused) => {
      setPaused(isPaused);
      if (isPaused) {
        pauseStartedRef.current = Date.now();
      } else if (pauseStartedRef.current != null) {
        pausedAccumRef.current += Date.now() - pauseStartedRef.current;
        pauseStartedRef.current = null;
      }
      tickElapsed();
    });
    return () => {
      unsubStart();
      unsubStop();
      unsubErr();
      unsubPause();
      clearTimer();
    };
  }, [beginTimer, clearTimer, tickElapsed]);

  // Resync if the user killed the notification while backgrounded.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const still = isLiveStreaming();
      setLive(still);
      setPaused(still && isLivePaused());
      if (!still) {
        clearTimer();
        setElapsedSec(0);
        setStarting(false);
        setTitle('');
        setBannerUri(null);
      }
    });
    return () => sub.remove();
  }, [clearTimer]);

  const startLive = useCallback(
    async (opts: LiveStartOpts) => {
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
      setTitle((opts.title ?? '').trim());
      setBannerUri(opts.bannerUri?.trim() || null);
      try {
        const result = await startLiveStream({
          rtmpUrl: opts.rtmpUrl,
          streamKey: opts.streamKey,
        });
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
    setPaused(false);
    setStarting(false);
    clearTimer();
    setElapsedSec(0);
    setTitle('');
    setBannerUri(null);
  }, [clearTimer]);

  const pauseLive = useCallback(async () => {
    try {
      await pauseLiveStream();
      setPaused(true);
      if (pauseStartedRef.current == null) pauseStartedRef.current = Date.now();
    } catch {
      emitToast('Could not pause live');
    }
  }, []);

  const resumeLive = useCallback(async () => {
    try {
      await resumeLiveStream();
      if (pauseStartedRef.current != null) {
        pausedAccumRef.current += Date.now() - pauseStartedRef.current;
        pauseStartedRef.current = null;
      }
      setPaused(false);
      tickElapsed();
    } catch {
      emitToast('Could not resume live');
    }
  }, [tickElapsed]);

  return (
    <LiveContext.Provider
      value={{
        live,
        paused,
        elapsedSec,
        starting,
        title,
        bannerUri,
        startLive,
        stopLive,
        pauseLive,
        resumeLive,
      }}
    >
      {children}
    </LiveContext.Provider>
  );
}

export function useLive() {
  return useContext(LiveContext);
}
