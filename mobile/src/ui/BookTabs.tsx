import React, { ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

const TURN_MS = 560;
const LEAVE_MS = 520;
/** Babel often inlines NODE_ENV away from 'test' under Jest — detect jest itself. */
const SKIP_MOTION =
  typeof jest !== 'undefined' || process.env.NODE_ENV === 'test';

type Dir = 'next' | 'prev';

/** Same contract as web `useBookTabs` — direction comes from tab order. */
export function useBookTabs(tabs: string[], initial: string) {
  const [tab, setTab] = useState(initial);
  const [turn, setTurn] = useState<{ id: string; dir: Dir } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function openTab(next: string) {
    if (next === tab) return;
    const from = tabs.indexOf(tab);
    const to = tabs.indexOf(next);
    if (from < 0 || to < 0 || SKIP_MOTION) {
      setTurn(null);
      setTab(next);
      return;
    }
    const dir: Dir = to > from ? 'next' : 'prev';
    setTurn({ id: tab, dir });
    setTab(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setTurn(null), TURN_MS);
  }

  return { tab, openTab, turn };
}

type PageVariant =
  | 'enter-next'
  | 'enter-prev'
  | 'leave-next'
  | 'leave-prev'
  | null;

function BookPage({
  variant,
  leaving,
  children,
  style,
}: {
  variant: PageVariant;
  leaving?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const progress = useRef(new Animated.Value(variant ? 0 : 1)).current;

  useEffect(() => {
    if (!variant || SKIP_MOTION) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: variant.startsWith('leave') ? LEAVE_MS : TURN_MS,
      easing: variant.startsWith('leave')
        ? Easing.out(Easing.ease)
        : Easing.bezier(0.22, 0.75, 0.2, 1),
      useNativeDriver: true,
    });
    anim.start();
    return () => {
      anim.stop();
      progress.stopAnimation();
    };
  }, [variant, progress]);

  let opacity: Animated.AnimatedInterpolation<number> | number = 1;
  let rotateY: Animated.AnimatedInterpolation<string> | string = '0deg';
  let translateX: Animated.AnimatedInterpolation<number> | number = 0;

  if (variant === 'enter-next') {
    opacity = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0.35, 1],
    });
    rotateY = progress.interpolate({
      inputRange: [0, 1],
      outputRange: ['42deg', '0deg'],
    });
    translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [28, 0],
    });
  } else if (variant === 'enter-prev') {
    opacity = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0.35, 1],
    });
    rotateY = progress.interpolate({
      inputRange: [0, 1],
      outputRange: ['-42deg', '0deg'],
    });
    translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [-28, 0],
    });
  } else if (variant === 'leave-next') {
    opacity = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0],
    });
    rotateY = progress.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '-62deg'],
    });
    translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -18],
    });
  } else if (variant === 'leave-prev') {
    opacity = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0],
    });
    rotateY = progress.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '62deg'],
    });
    translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 18],
    });
  }

  return (
    <Animated.View
      pointerEvents={leaving ? 'none' : 'auto'}
      style={[
        styles.page,
        leaving ? styles.leaving : null,
        style,
        {
          opacity,
          transform: [
            { perspective: 1600 },
            { rotateY },
            { translateX },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Page-turn stage matching web Rule Book / Guild tab switches. */
export function BookStage({
  tab,
  turn,
  style,
  children,
}: {
  tab: string;
  turn: { id: string; dir: Dir } | null;
  style?: StyleProp<ViewStyle>;
  children: (activeTab: string) => ReactNode;
}) {
  return (
    <View style={[styles.stage, style]}>
      {turn ? (
        <BookPage
          key={`leave-${turn.id}`}
          variant={`leave-${turn.dir}`}
          leaving
        >
          {children(turn.id)}
        </BookPage>
      ) : null}
      <BookPage
        key={`page-${tab}`}
        variant={turn ? `enter-${turn.dir}` : null}
      >
        {children(tab)}
      </BookPage>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    position: 'relative',
    overflow: 'visible',
  },
  page: {
    width: '100%',
    flex: 1,
  },
  leaving: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
});
