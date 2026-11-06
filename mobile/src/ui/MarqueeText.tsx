import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

type Props = {
  children: string;
  style?: TextStyle;
  containerStyle?: ViewStyle;
  /** Line box height — keeps absolute text from collapsing the row. */
  lineHeight?: number;
  /**
   * Continuously scrolls when the text overflows (invite links, etc.).
   * Without this, scroll starts only on hover (web) / press (native).
   */
  autoPlay?: boolean;
};

/**
 * Single-line text clipped to its box. When the value is longer than the box,
 * it scrolls into view — never grows the layout.
 */
export function MarqueeText({
  children,
  style,
  containerStyle,
  lineHeight = 20,
  autoPlay = false,
}: Props) {
  const [boxW, setBoxW] = useState(0);
  const [textW, setTextW] = useState(0);
  const [active, setActive] = useState(autoPlay);
  const offset = useRef(new Animated.Value(0)).current;
  const overflow = boxW > 0 && textW > boxW + 2;

  useEffect(() => {
    if (autoPlay) setActive(true);
  }, [autoPlay, children]);

  useEffect(() => {
    offset.stopAnimation();
    if (process.env.JEST_WORKER_ID != null) {
      offset.setValue(0);
      return;
    }

    if (!overflow || !active) {
      Animated.timing(offset, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
      return;
    }

    const travel = textW - boxW + 12;
    const duration = Math.max(2200, travel * 26);

    if (autoPlay) {
      offset.setValue(0);
      const loop = Animated.loop(
        Animated.sequence([
          Animated.delay(900),
          Animated.timing(offset, {
            toValue: -travel,
            duration,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.delay(1100),
          Animated.timing(offset, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
      return () => {
        loop.stop();
        offset.stopAnimation();
      };
    }

    const anim = Animated.timing(offset, {
      toValue: -travel,
      duration,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    anim.start();
    return () => {
      anim.stop();
      offset.stopAnimation();
    };
  }, [active, autoPlay, overflow, boxW, textW, offset, children]);

  const hoverProps =
    autoPlay || Platform.OS === 'web'
      ? autoPlay
        ? {}
        : ({
            onMouseEnter: () => setActive(true),
            onMouseLeave: () => setActive(false),
          } as object)
      : {
          onStartShouldSetResponder: () => true,
          onResponderGrant: () => setActive(true),
          onResponderRelease: () => setActive(false),
          onResponderTerminate: () => setActive(false),
        };

  return (
    <View
      style={[styles.clip, { height: lineHeight }, containerStyle]}
      onLayout={(e) => setBoxW(e.nativeEvent.layout.width)}
      accessibilityRole="text"
      accessibilityLabel={children}
      {...hoverProps}
    >
      {/* Absolute track — cannot expand the flex row / card. */}
      <Animated.Text
        numberOfLines={1}
        style={[
          style,
          styles.track,
          {
            lineHeight,
            height: lineHeight,
            transform: [{ translateX: offset }],
          },
          Platform.OS === 'web' ? styles.trackWeb : null,
        ]}
        onLayout={(e) => setTextW(e.nativeEvent.layout.width)}
      >
        {children}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    width: '100%',
    maxWidth: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  track: {
    position: 'absolute',
    left: 0,
    top: 0,
    // Don't shrink to the clip width — we need the natural text width.
    flexShrink: 0,
  },
  // RN-web-only CSS props with no equivalent in React Native's own style
  // types — keeps the text on one unbroken line for measuring + scrolling.
  trackWeb: {
    whiteSpace: 'nowrap',
    width: 'max-content',
    maxWidth: 'none',
  } as any,
});
