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
  addLiveMutedListener,
  addLivePausedListener,
  addLiveStartedListener,
  addLiveStoppedListener,
  isLiveMuted,
  isLivePaused,
  isLiveStreaming,
  pauseLiveStream,
  resumeLiveStream,
  setLiveMuted,
  startLiveStream,
  stopLiveStream,
} from '../media/liveStreamer';
import { isVoiceCallActive } from '../voice/voiceAudioProfile';
import { isVoiceScreenSharing } from '../voice/voiceScreenShareGate';
import { emitToast } from '../ui/toastBus';

export type LiveStartOpts = {
  /** One to three RTMP destinations — same screen goes to all of them. */
  destinations: Array<{ rtmpUrl: string; streamKey: string }>;
  title?: string;
  bannerUri?: string | null;
  /** YouTube watch/live URL or video id — pulls public Live Chat onto overlay. */
  youtubeLiveUrl?: string | null;
};

type LiveCtx = {
  live: boolean;
  paused: boolean;
  /** Mic + game audio silenced, without dropping the video like pause does. */
  muted: boolean;
  elapsedSec: number;
  starting: boolean;
  title: string;
  bannerUri: string | null;
  youtubeLiveUrl: string | null;
  startLive: (opts: LiveStartOpts) => Promise<boolean>;
  stopLive: () => Promise<void>;
  pauseLive: () => Promise<void>;
  resumeLive: () => Promise<void>;
  toggleMute: () => Promise<void>;
};

const LiveContext = createContext<LiveCtx>({
  live: false,
  paused: false,
  muted: false,
  elapsedSec: 0,
  starting: false,
  title: '',
  bannerUri: null,
  youtubeLiveUrl: null,
  startLive: async () => false,
  stopLive: async () => undefined,
  pauseLive: async () => undefined,
  resumeLive: async () => undefined,
  toggleMute: async () => undefined,
});

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const [live, setLive] = useState(() => isLiveStreaming());
  const [paused, setPaused] = useState(() => isLivePaused());
  const [muted, setMuted] = useState(() => isLiveMuted());
  const [starting, setStarting] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [title, setTitle] = useState('');
  const [bannerUri, setBannerUri] = useState<string | null>(null);
  const [youtubeLiveUrl, setYoutubeLiveUrl] = useState<string | null>(null);
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
      setMuted(false);
      setStarting(false);
      beginTimer();
    });
    const unsubStop = addLiveStoppedListener((error) => {
      setLive(false);
      setPaused(false);
      setMuted(false);
      setStarting(false);
      clearTimer();
      setElapsedSec(0);
      setTitle('');
      setBannerUri(null);
      setYoutubeLiveUrl(null);
      if (error) emitToast(error);
    });
    const unsubErr = addLiveErrorListener((message) => {
      setStarting(false);
      emitToast(message);
    });
    const unsubMute = addLiveMutedListener((isMuted) => {
      setMuted(isMuted);
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
      unsubMute();
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
      setMuted(still && isLiveMuted());
      if (!still) {
        clearTimer();
        setElapsedSec(0);
        setStarting(false);
        setTitle('');
        setBannerUri(null);
        setYoutubeLiveUrl(null);
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
      if (isVoiceScreenSharing()) {
        emitToast('Stop voice screen share before going live');
        return false;
      }
      if (isLiveStreaming() || starting) return true;
      setStarting(true);
      setTitle((opts.title ?? '').trim());
      setBannerUri(opts.bannerUri?.trim() || null);
      setYoutubeLiveUrl(opts.youtubeLiveUrl?.trim() || null);
      try {
        const result = await startLiveStream({
          destinations: opts.destinations,
          // Native keeps it so pause can paint it over the captured game.
          bannerUri: opts.bannerUri ?? null,
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
        // A call already playing is locked to Android's voice-call audio
        // path, which the platform refuses to let the broadcast capture.
        // Rejoining builds it as media audio, which does reach viewers.
        if (isVoiceCallActive()) {
          emitToast('Rejoin the voice call so your friends are heard on stream');
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
    setMuted(false);
    setStarting(false);
    clearTimer();
    setElapsedSec(0);
    setTitle('');
    setBannerUri(null);
    setYoutubeLiveUrl(null);
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

  const toggleMute = useCallback(async () => {
    const next = !muted;
    // Optimistic: the native onMuted event confirms (or corrects) it.
    setMuted(next);
    try {
      await setLiveMuted(next);
    } catch {
      setMuted(!next);
      emitToast('Could not change the stream mic');
    }
  }, [muted]);

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
        muted,
        elapsedSec,
        starting,
        title,
        bannerUri,
        youtubeLiveUrl,
        startLive,
        stopLive,
        pauseLive,
        resumeLive,
        toggleMute,
      }}
    >
      {children}
    </LiveContext.Provider>
  );
}

export function useLive() {
  return useContext(LiveContext);
}
