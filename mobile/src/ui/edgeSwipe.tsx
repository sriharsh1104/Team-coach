import React, { useMemo, useRef } from 'react';
import {
  Dimensions,
  GestureResponderEvent,
  PanResponder,
  PanResponderGestureState,
  StyleSheet,
  View,
} from 'react-native';

const EDGE_PX = 28;
const THRESHOLD = 56;
const WINDOW_W = Dimensions.get('window').width;

type Props = {
  /** Finger moves left → right from an edge (Android-style back). */
  onSwipeRight?: () => void;
  /** Finger moves right → left from an edge (open the side drawer). */
  onSwipeLeft?: () => void;
  /**
   * When true, only start a gesture from the left or right screen edge so
   * vertical scrolls / list pans don't steal opens.
   */
  edgeOnly?: boolean;
  children: React.ReactNode;
};

/**
 * Horizontal edge swipes without react-native-gesture-handler.
 * Left-edge swipe right → back; right-edge swipe left → open sidebar.
 */
export function EdgeSwipe({
  onSwipeRight,
  onSwipeLeft,
  edgeOnly = true,
  children,
}: Props) {
  const rightRef = useRef(onSwipeRight);
  const leftRef = useRef(onSwipeLeft);
  rightRef.current = onSwipeRight;
  leftRef.current = onSwipeLeft;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (
          e: GestureResponderEvent,
          g: PanResponderGestureState,
        ) => {
          if (!rightRef.current && !leftRef.current) return false;
          const { dx, dy } = g;
          if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.2) {
            return false;
          }
          if (edgeOnly) {
            const x = e.nativeEvent.pageX;
            // Left-edge start for either direction so inbox scroll stays free.
            if (x > EDGE_PX && x < WINDOW_W - EDGE_PX) return false;
          }
          return true;
        },
        onPanResponderRelease: (_e, g) => {
          if (g.dx >= THRESHOLD) {
            rightRef.current?.();
            return;
          }
          if (g.dx <= -THRESHOLD) {
            leftRef.current?.();
          }
        },
      }),
    [edgeOnly],
  );

  return (
    <View style={styles.fill} {...pan.panHandlers}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
