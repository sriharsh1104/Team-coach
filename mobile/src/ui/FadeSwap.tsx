import React, { useEffect, useRef } from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';

const SKIP_MOTION = process.env.NODE_ENV === 'test';

/**
 * Fades + lightly lifts children whenever `contentKey` changes — used for
 * tab panels so switching sections feels smooth instead of abrupt.
 */
export function FadeSwap({
  contentKey,
  children,
  style,
}: {
  contentKey: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (SKIP_MOTION) {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }
    opacity.setValue(0);
    translateY.setValue(8);
    const anim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]);
    anim.start();
    return () => {
      anim.stop();
      opacity.stopAnimation();
      translateY.stopAnimation();
    };
  }, [contentKey, opacity, translateY]);

  return (
    <Animated.View
      style={[style, { opacity, transform: [{ translateY }] }]}
    >
      {children}
    </Animated.View>
  );
}
