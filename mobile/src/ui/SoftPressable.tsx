import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { HapticKind, haptic } from './haptics';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /** How far the press scales down (default 0.97). */
  pressScale?: number;
  /**
   * Tap feedback fired with the scale-down. Defaults to the light
   * `selection` tick; pass a heavier kind for weighty actions, or `false`
   * for controls that fire repeatedly (sliders, long-press repeats) where a
   * buzz per tick would be noise.
   */
  haptic?: HapticKind | false;
};

const LAYOUT_KEYS = [
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'alignSelf',
  'width',
  'height',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginHorizontal',
  'marginVertical',
  'marginStart',
  'marginEnd',
] as const;

/** Flex/margin must sit on Pressable — children can't stretch a shrink-wrapped parent. */
function layoutFromStyle(style: StyleProp<ViewStyle>): ViewStyle | undefined {
  const flat = StyleSheet.flatten(style);
  if (!flat) return undefined;
  const out: ViewStyle = {};
  for (const key of LAYOUT_KEYS) {
    const value = flat[key];
    if (value !== undefined) (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

/** Visual-only styles for the scaled child — layout props + native-driver
 * transform together make tab labels vanish on Android (flex:1 + minWidth:0). */
function visualFromStyle(style: StyleProp<ViewStyle>): ViewStyle | undefined {
  const flat = StyleSheet.flatten(style);
  if (!flat) return undefined;
  const out: Record<string, unknown> = { ...flat };
  for (const key of LAYOUT_KEYS) delete out[key];
  return out as ViewStyle;
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
  haptic: hapticKind = 'selection',
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
        if (!disabled) {
          animateTo(pressScale);
          if (hapticKind) haptic(hapticKind);
        }
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        animateTo(1);
        onPressOut?.(e);
      }}
      {...rest}
    >
      <Animated.View
        // No pressed-background flash — only a light scale so close/X icons
        // don't look like a highlighted blob over the sheet chrome.
        style={[visualFromStyle(style), { alignSelf: 'stretch', transform: [{ scale }] }]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}
