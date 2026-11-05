import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /** How far the press scales down (default 0.97). */
  pressScale?: number;
};

/** Flex/margin must sit on Pressable — children can't stretch a shrink-wrapped parent. */
function layoutFromStyle(style: StyleProp<ViewStyle>): ViewStyle | undefined {
  const flat = StyleSheet.flatten(style);
  if (!flat) return undefined;
  const {
    flex,
    flexGrow,
    flexShrink,
    flexBasis,
    alignSelf,
    width,
    height,
    minWidth,
    maxWidth,
    minHeight,
    maxHeight,
    margin,
    marginTop,
    marginBottom,
    marginLeft,
    marginRight,
    marginHorizontal,
    marginVertical,
    marginStart,
    marginEnd,
  } = flat;
  return {
    flex,
    flexGrow,
    flexShrink,
    flexBasis,
    alignSelf,
    width,
    height,
    minWidth,
    maxWidth,
    minHeight,
    maxHeight,
    margin,
    marginTop,
    marginBottom,
    marginLeft,
    marginRight,
    marginHorizontal,
    marginVertical,
    marginStart,
    marginEnd,
  };
}

/**
 * Pressable with a light spring scale — makes taps feel responsive without
 * pulling in reanimated. Visual styles land on the animated child so
 * borders/bg scale with the press; flex/margin stay on Pressable so row
 * layouts (gap + flex:1) still work.
 */
export function SoftPressable({
  children,
  style,
  disabled,
  pressScale = 0.97,
  onPressIn,
  onPressOut,
  ...rest
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const skipMotion =
    typeof jest !== 'undefined' || process.env.NODE_ENV === 'test';

  const animateTo = (value: number) => {
    if (skipMotion) {
      scale.setValue(value);
      return;
    }
    Animated.spring(scale, {
      toValue: value,
      useNativeDriver: true,
      friction: 7,
      tension: 220,
    }).start();
  };

  return (
    <Pressable
      disabled={disabled}
      style={layoutFromStyle(style)}
      onPressIn={(e) => {
        if (!disabled) animateTo(pressScale);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        animateTo(1);
        onPressOut?.(e);
      }}
      {...rest}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
