import React, { useEffect, useRef } from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';

const SKIP =
  typeof jest !== 'undefined' || process.env.NODE_ENV === 'test';

type Props = {
  children: React.ReactNode;
  /** ms — keep short so it feels snappy, not theatrical. */
  duration?: number;
  style?: StyleProp<ViewStyle>;
  /** Remount key so a new chat / player row restarts the fade. */
  animKey?: string | number;
};

/**
 * One-shot opacity fade for screen swaps and new list rows. Native driver
 * only — no layout thrash.
 */
export function FadeIn({
  children,
  duration = 140,
  style,
  animKey,
}: Props) {
  const opacity = useRef(new Animated.Value(SKIP ? 1 : 0)).current;

  useEffect(() => {
    if (SKIP) {
      opacity.setValue(1);
      return;
    }
    opacity.setValue(0);
    const anim = Animated.timing(opacity, {
      toValue: 1,
      duration,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [animKey, duration, opacity]);

  return (
    <Animated.View style={[{ opacity }, style]}>{children}</Animated.View>
  );
}
