import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
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
};

/**
 * Single-line text clipped to its box. When the value is longer than the box,
 * hovering (web) or focusing the row scrolls it into view — never grows the layout.
 */
export function MarqueeText({
  children,
  style,
  containerStyle,
  lineHeight = 20,
}: Props) {
  const [boxW, setBoxW] = useState(0);
  const [textW, setTextW] = useState(0);
  const [active, setActive] = useState(false);
  const offset = useRef(new Animated.Value(0)).current;
  const overflow = boxW > 0 && textW > boxW + 2;

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
  }, [active, overflow, boxW, textW, offset, children]);

  const hoverProps =
    Platform.OS === 'web'
      ? ({
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
  trackWeb: {
    // @ts-expect-error RN-web CSS — keep one unbroken line for measure + scroll
    whiteSpace: 'nowrap',
    width: 'max-content',
    maxWidth: 'none',
  },
});
