import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from 'react-native';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /** How far the press scales down (default 0.97). */
  pressScale?: number;
};

/**
 * Pressable with a light spring scale — makes taps feel responsive without
 * pulling in reanimated. Style lands on the animated child so borders/bg
 * scale with the press.
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
  const skipMotion = process.env.NODE_ENV === 'test';

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
