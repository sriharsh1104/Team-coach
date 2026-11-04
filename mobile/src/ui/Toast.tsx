import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { setToastListener } from './toastBus';

interface Props {
  message: string | null;
}

/**
 * Fixed top-right banner. Prefer the app-root `ToastProvider` for API errors
 * (wired through axios). Screens can still use local `useToast()` for
 * success confirmations scoped to that screen.
 */
export function Toast({ message }: Props) {
  if (!message) return null;

  return (
    <View style={styles.container} pointerEvents="none" accessibilityLiveRegion="polite">
      <Text style={styles.text} numberOfLines={3}>
        {message}
      </Text>
    </View>
  );
}

export function useToast(durationMs = 2000) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (text: string) => {
      if (timer.current) clearTimeout(timer.current);
      setMessage(text);
      timer.current = setTimeout(() => setMessage(null), durationMs);
    },
    [durationMs],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { message, showToast };
}

type ToastContextValue = {
  showToast: (text: string, durationMs?: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

/** App-root host — one banner for API / global toasts. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string, durationMs = 4000) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => setMessage(null), durationMs);
  }, []);

  useEffect(() => {
    setToastListener(showToast);
    return () => {
      setToastListener(null);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Toast message={message} />
    </ToastContext.Provider>
  );
}

export function useAppToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useAppToast must be used inside ToastProvider');
  }
  return ctx;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 16,
    right: 16,
    maxWidth: '78%',
    backgroundColor: '#1c1c20',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    zIndex: 1000,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  text: { color: colors.text, fontSize: 13, fontWeight: '600' },
});
