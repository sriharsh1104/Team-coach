import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { setToastListener } from './toastBus';

interface Props {
  message: string | null;
}

/**
 * Fixed top banner inside the safe area (status bar / notch / home indicator).
 * Prefer the app-root `ToastProvider` for API errors (wired through axios).
 * Screens can still use local `useToast()` for success confirmations.
 */
export function Toast({ message }: Props) {
  const insets = useSafeAreaInsets();
  if (!message) return null;

  return (
    <View
      style={[
        styles.anchor,
        {
          paddingTop: insets.top + 12,
          paddingLeft: Math.max(insets.left, 16),
          paddingRight: Math.max(insets.right, 16),
        },
      ]}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.banner}>
        <Text style={styles.text} numberOfLines={4}>
          {message}
        </Text>
      </View>
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
      <View style={styles.host}>
        {children}
        {/* Full-screen overlay so the banner is always pinned to the top of
            the window — not the bottom of a nested Screen / scroll sibling. */}
        <View style={styles.overlay} pointerEvents="box-none">
          <Toast message={message} />
        </View>
      </View>
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
  host: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  // Top-of-screen strip (safe area via paddingTop). Centered, not bottom-right.
  anchor: {
    width: '100%',
    alignItems: 'center',
  },
  banner: {
    maxWidth: '100%',
    width: '100%',
    backgroundColor: '#1c1c20',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  text: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'center',
  },
});
