import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import {
  addScreenRecordingStoppedListener,
  isScreenRecording,
  startScreenRecording,
  stopScreenRecording,
} from '../media/screenRecorder';
import { emitToast } from '../ui/toastBus';

type RecordingCtx = {
  recording: boolean;
  elapsedSec: number;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
};

const RecordingContext = createContext<RecordingCtx>({
  recording: false,
  elapsedSec: 0,
  startRecording: async () => {},
  stopRecording: async () => {},
});

export function RecordingProvider({ children }: { children: React.ReactNode }) {
  const [recording, setRecording] = useState(() => isScreenRecording());
  const [elapsedSec, setElapsedSec] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startEpochRef = useRef<number>(0);

  // Native "stopped" events (e.g. 30-min limit, notification tap)
  useEffect(() => {
    const unsub = addScreenRecordingStoppedListener((uri) => {
      setRecording(false);
      setElapsedSec(0);
      if (uri) emitToast('Recording saved to gallery 🎬');
    });
    return unsub;
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

  const startRecording = useCallback(async () => {
    if (Platform.OS !== 'android') {
      emitToast('Screen recording is only available on Android');
      return;
    }
    if (recording) {
      emitToast('Recording is already in progress');
      return;
    }
    const result = await startScreenRecording();
    if (result === 'started') {
      setRecording(true);
      setElapsedSec(0);
      emitToast('Recording started — go play your game! Stop from widget or notification.');
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

  return (
    <RecordingContext.Provider
      value={{ recording, elapsedSec, startRecording, stopRecording }}
    >
      {children}
    </RecordingContext.Provider>
  );
}

export function useRecording(): RecordingCtx {
  return useContext(RecordingContext);
}
