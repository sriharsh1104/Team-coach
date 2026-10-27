import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

interface Props {
  message: string | null;
}

/**
 * Fixed top-right banner. Each screen owns its own message state via
 * `useToast()` below — no global queue/context, since every call site today
 * just wants to show one short-lived confirmation or error at a time. No
 * fade animation — a plain show/hide keeps this simple and avoids Animated
 * timers outliving a test's render/unmount cycle.
 */
export function Toast({ message }: Props) {
  if (!message) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      <Text style={styles.text} numberOfLines={2}>
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

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { message, showToast };
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 16,
    right: 16,
    maxWidth: '70%',
    backgroundColor: '#1c1c20',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 8,
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
