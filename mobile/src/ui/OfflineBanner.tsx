import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOnlineStatus } from '../net/useOnlineStatus';
import { ThemeColors } from '../theme';
import { useThemedStyles } from '../theme/useThemedStyles';
import { haptic } from './haptics';

/** Babel often inlines NODE_ENV away from 'test' under Jest — detect jest itself. */
const SKIP_MOTION =
  typeof jest !== 'undefined' || process.env.NODE_ENV === 'test';

/** How long "Back online" stays up before the bar slides away again. */
const BACK_ONLINE_MS = 1800;

/**
 * Persistent connection bar, pinned to the bottom so it never collides with
 * the toast banner or a screen header. Without it a dropped connection just
 * looks like the app hanging: taps do nothing until a 15s axios timeout.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(bannerStyles);

  // `null` = never been offline this session, so nothing to announce.
  const [mode, setMode] = useState<'offline' | 'restored' | null>(null);
  const slide = useRef(new Animated.Value(0)).current;
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      setMode('offline');
      haptic('warning');
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    setMode('restored');
    haptic('success');
    const timer = setTimeout(() => setMode(null), BACK_ONLINE_MS);
    return () => clearTimeout(timer);
  }, [online]);

  useEffect(() => {
    const to = mode ? 1 : 0;
    if (SKIP_MOTION) {
      slide.setValue(to);
      return;
    }
    const anim = Animated.timing(slide, {
      toValue: to,
      duration: 180,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [mode, slide]);

  if (!mode) return null;

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[
        staticStyles.anchor,
        mode === 'offline' ? styles.offline : styles.restored,
        {
          paddingBottom: insets.bottom + 10,
          transform: [
            { translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) },
          ],
        },
      ]}
    >
      <Text style={styles.text}>
        {mode === 'offline'
          ? "You're offline — changes will wait until you reconnect."
          : 'Back online'}
      </Text>
    </Animated.View>
  );
}

const staticStyles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingHorizontal: 16,
  },
});

function bannerStyles(c: ThemeColors) {
  return {
    offline: { backgroundColor: c.danger },
    restored: { backgroundColor: c.chrome },
    text: {
      color: c.bg,
      fontSize: 13,
      fontWeight: '600' as const,
      textAlign: 'center' as const,
    },
  };
}
