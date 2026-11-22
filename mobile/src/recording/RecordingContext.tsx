import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';
import {
  addScreenRecordingStoppedListener,
  discardRecording,
  isScreenRecording,
  saveRecordingToGallery,
  startScreenRecording,
  stopScreenRecording,
} from '../media/screenRecorder';
import { confirmAsync } from '../ui/confirmAsync';
import { emitToast } from '../ui/toastBus';

/** A finished recording that was started from a chat, waiting for "send it?". */
export type PendingRecordingShare = {
  uri: string;
  channelKey: string;
  finishedAt: number;
};

/** Ignore a finished recording nobody confirmed within this window. */
const PENDING_SHARE_TTL_MS = 30 * 60 * 1000;

type RecordingCtx = {
  recording: boolean;
  elapsedSec: number;
  /** Pass the chat `channelKey` to be offered "send this recording?" when it stops. */
  startRecording: (originChannelKey?: string) => Promise<void>;
  stopRecording: () => Promise<void>;
  pendingShare: PendingRecordingShare | null;
  clearPendingShare: () => void;
};

const RecordingContext = createContext<RecordingCtx>({
  recording: false,
  elapsedSec: 0,
  startRecording: async () => {},
  stopRecording: async () => {},
  pendingShare: null,
  clearPendingShare: () => undefined,
});

export function RecordingProvider({ children }: { children: React.ReactNode }) {
  const [recording, setRecording] = useState(() => isScreenRecording());
  const [elapsedSec, setElapsedSec] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startEpochRef = useRef<number>(0);
  const originChannelRef = useRef<string | null>(null);
  const [pendingShare, setPendingShare] = useState<PendingRecordingShare | null>(null);

  // A finished recording is only in the app cache. The user decides: save it
  // to the gallery or throw it away. If the recording ended while the app was
  // in the background (notification Stop, 30-min limit) the question waits
  // until the app is open again — an Alert cannot show before that.
  const [awaitingDecision, setAwaitingDecision] = useState(false);
  const deciding = useRef(false);

  // Native "stopped" events (e.g. 30-min limit, notification tap)
  useEffect(() => {
    const unsub = addScreenRecordingStoppedListener((uri) => {
      setRecording(false);
      setElapsedSec(0);
      if (!uri) return;
      setAwaitingDecision(true);
    });
    return unsub;
  }, []);

  const askSaveOrDiscard = useCallback(async () => {
    if (deciding.current) return;
    deciding.current = true;
    try {
      const save = await confirmAsync(
        'Save this recording?',
        'Save it to your gallery, or discard it.',
        'Save',
        'Discard',
        false,
      );
      setAwaitingDecision(false);
      const channelKey = originChannelRef.current;
      originChannelRef.current = null;
      if (!save) {
        await discardRecording().catch(() => undefined);
        emitToast('Recording discarded');
        return;
      }
      try {
        const saved = await saveRecordingToGallery();
        if (!saved) throw new Error('not saved');
        emitToast('Recording saved to gallery 🎬');
        if (channelKey) {
          setPendingShare({ uri: saved, channelKey, finishedAt: Date.now() });
        }
      } catch {
        emitToast('Could not save the recording');
      }
    } finally {
      deciding.current = false;
    }
  }, []);

  useEffect(() => {
    if (!awaitingDecision) return;
    if (AppState.currentState === 'active') {
      void askSaveOrDiscard();
      return;
    }
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void askSaveOrDiscard();
    });
    return () => sub.remove();
  }, [awaitingDecision, askSaveOrDiscard]);

  // Re-sync state when app comes back to foreground (covers the case where
  // Android stopped the projection while the app was in the background).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        const native = isScreenRecording();
        setRecording((prev) => {
          if (prev !== native) {
            if (!native) setElapsedSec(0);
          }
          return native;
        });
      }
    });
    return () => sub.remove();
  }, []);

  // Drive the elapsed-second counter
  useEffect(() => {
    if (recording) {
      startEpochRef.current = Date.now() - elapsedSec * 1000;
      timerRef.current = setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - startEpochRef.current) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // elapsedSec intentionally omitted — only reset when recording flips
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  const startRecording = useCallback(async (originChannelKey?: string) => {
    if (Platform.OS !== 'android') {
      emitToast('Screen recording is only available on Android');
      return;
    }
    if (recording) {
      emitToast('Recording is already in progress');
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isVoiceScreenSharing } = require('../voice/voiceScreenShareGate') as {
      isVoiceScreenSharing: () => boolean;
    };
    if (isVoiceScreenSharing()) {
      emitToast('Stop voice screen share before recording');
      return;
    }
    const result = await startScreenRecording();
    if (result === 'started') {
      originChannelRef.current = originChannelKey ?? null;
      setRecording(true);
      setElapsedSec(0);
      emitToast('Recording started — Open your game! Stop from widget or notification.');
    } else if (result === 'unsupported') {
      emitToast('Screen recording not supported on this device');
    } else {
      emitToast('Screen recording not available in this build');
    }
  }, [recording]);

  const stopRecording = useCallback(async () => {
    await stopScreenRecording();
    // native onStopped will also fire and clean up, but set locally immediately
    setRecording(false);
    setElapsedSec(0);
  }, []);

  const clearPendingShare = useCallback(() => setPendingShare(null), []);

  return (
    <RecordingContext.Provider
      value={{
        recording,
        elapsedSec,
        startRecording,
        stopRecording,
        pendingShare:
          pendingShare && Date.now() - pendingShare.finishedAt < PENDING_SHARE_TTL_MS
            ? pendingShare
            : null,
        clearPendingShare,
      }}
    >
      {children}
    </RecordingContext.Provider>
  );
}

export function useRecording(): RecordingCtx {
  return useContext(RecordingContext);
}
