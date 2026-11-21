import React, { createContext, useContext, useEffect, useRef } from 'react';
import { Animated, StyleProp, View, ViewStyle } from 'react-native';
import { ThemeColors } from '../theme';
import { useThemedStyles } from '../theme/useThemedStyles';

/** Babel often inlines NODE_ENV away from 'test' under Jest — detect jest itself. */
const SKIP_MOTION =
  typeof jest !== 'undefined' || process.env.NODE_ENV === 'test';

const PulseContext = createContext<Animated.Value | null>(null);

/** Shared clock so every block on a screen pulses in step, not in a shimmer mob. */
function usePulse(): Animated.Value {
  const shared = useContext(PulseContext);
  const local = useRef(new Animated.Value(0.45)).current;
  const pulse = shared ?? local;
  useEffect(() => {
    if (shared || SKIP_MOTION) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(local, {
          toValue: 0.9,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(local, {
          toValue: 0.45,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      local.stopAnimation();
    };
  }, [shared, local]);
  return pulse;
}

function PulseProvider({ children }: { children: React.ReactNode }) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    if (SKIP_MOTION) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.9,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      pulse.stopAnimation();
    };
  }, [pulse]);
  return <PulseContext.Provider value={pulse}>{children}</PulseContext.Provider>;
}

type BlockProps = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * One placeholder block. Prefer a `Skeleton*` layout below over hand-rolling
 * rows so loading states stay consistent between screens.
 */
export function Skeleton({
  width = '100%',
  height = 14,
  radius = 6,
  style,
  testID = 'skeleton-block',
}: BlockProps) {
  const styles = useThemedStyles(skeletonStyles);
  const pulse = usePulse();
  return (
    <Animated.View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.block,
        { width, height, borderRadius: radius, opacity: pulse },
        style,
      ]}
    />
  );
}

/**
 * Avatar + two text lines — matches the chat/member/game row shape closely
 * enough that content swapping in doesn't shift the layout.
 */
export function SkeletonRow({
  avatar = true,
  avatarSize = 44,
}: {
  avatar?: boolean;
  avatarSize?: number;
}) {
  const styles = useThemedStyles(skeletonStyles);
  return (
    <View style={styles.row}>
      {avatar ? (
        <Skeleton
          width={avatarSize}
          height={avatarSize}
          radius={avatarSize / 2}
        />
      ) : null}
      <View style={styles.rowText}>
        <Skeleton width="55%" height={13} />
        <Skeleton width="80%" height={11} />
      </View>
    </View>
  );
}

/** Drop-in for a list's loading state: `{loading ? <SkeletonList /> : rows}`. */
export function SkeletonList({
  count = 6,
  avatar = true,
  avatarSize = 44,
  style,
}: {
  count?: number;
  avatar?: boolean;
  avatarSize?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PulseProvider>
      <View style={style} testID="skeleton-list">
        {Array.from({ length: count }, (_, i) => (
          <SkeletonRow key={i} avatar={avatar} avatarSize={avatarSize} />
        ))}
      </View>
    </PulseProvider>
  );
}

/** Rectangular tiles for media/stat grids. */
export function SkeletonGrid({
  count = 6,
  columns = 3,
  gap = 8,
  aspect = 1,
  style,
}: {
  count?: number;
  columns?: number;
  gap?: number;
  aspect?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const widthPct = `${(100 - (columns - 1) * 2) / columns}%` as `${number}%`;
  return (
    <PulseProvider>
      <View
        style={[{ flexDirection: 'row', flexWrap: 'wrap', gap }, style]}
        testID="skeleton-grid"
      >
        {Array.from({ length: count }, (_, i) => (
          <Skeleton
            key={i}
            width={widthPct}
            height={110 / aspect}
            radius={10}
          />
        ))}
      </View>
    </PulseProvider>
  );
}

function skeletonStyles(c: ThemeColors) {
  return {
    block: {
      // Slightly stronger than `surface` so blocks read as placeholders
      // rather than as empty cards the user might try to tap.
      backgroundColor: c.border,
    },
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 12,
      paddingVertical: 12,
    },
    rowText: {
      flex: 1,
      gap: 8,
    },
  };
}
