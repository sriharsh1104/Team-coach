import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getFocusedRouteNameFromRef,
  navigateToVoice,
  subscribeToFocusedRoute,
} from '../navigation/navigationRef';
import { useVoiceContext } from './VoiceContext';
import { AppIcon } from '../ui/AppIcon';

const BAR_HEIGHT = 56;
const BAR_WIDTH = 280;
const EDGE_PAD = 12;
const DRAG_THRESHOLD = 6;

function isGameRoute(name: string | undefined): boolean {
  return name === 'GameRoom' || name === 'Games';
}

type Pos = { x: number; y: number };

/**
 * Floating PiP-style widget shown when the user has an active voice session
 * but has navigated away from the Voice screen. Mounted above the navigator
 * (App.tsx) so native-stack screens cannot cover it. Freely draggable.
 */
export function VoiceFloatingWidget() {
  const { controller, isScreenFocused, deactivate } = useVoiceContext();
  const insets = useSafeAreaInsets();
  const [focusedRoute, setFocusedRoute] = useState<string | undefined>(() =>
    getFocusedRouteNameFromRef(),
  );
  const onGame = isGameRoute(focusedRoute);

  const window = Dimensions.get('window');
  const minX = EDGE_PAD;
  const maxX = Math.max(minX, window.width - EDGE_PAD - BAR_WIDTH);
  const minY = insets.top + EDGE_PAD;
  const maxY = Math.max(minY, window.height - insets.bottom - EDGE_PAD - BAR_HEIGHT);

  const defaultBottom: Pos = { x: EDGE_PAD, y: maxY };
  const defaultGame: Pos = { x: EDGE_PAD, y: minY };

  const [pos, setPos] = useState<Pos>(defaultBottom);
  const posRef = useRef(pos);
  const dragStart = useRef<Pos>(pos);
  const dragged = useRef(false);
  const slideAnim = useRef(new Animated.Value(120)).current;

  const isConnected = controller?.status === 'connected';
  // A session that is connecting (incl. a mid-call reconnect) still owns the
  // mic, so the widget stays mounted and can slide back in. Anything else —
  // idle / error — means there is no call to float, and the full-screen layer
  // below must not stay over the app.
  const isLive = isConnected || controller?.status === 'connecting';
  const isGuild = controller?.room === 'guild';
  const micOff = !!controller && (controller.isMuted || !!controller.isHostMuted);
  const shouldShow = isConnected && !isScreenFocused;

  const memberCount =
    controller?.roomCount ??
    (controller ? controller.participants.length + (isConnected ? 1 : 0) : 0);

  // Track focused route without living inside NavigationContainer. This must
  // go through the module-level emitter: a listener added to the container
  // ref is dropped when RootNavigator remounts (it is keyed by phase + user),
  // which left the widget frozen on a stale route.
  useEffect(() => {
    setFocusedRoute(getFocusedRouteNameFromRef());
    return subscribeToFocusedRoute(setFocusedRoute);
  }, []);

  const wasOnGame = useRef(false);
  useEffect(() => {
    if (onGame && !wasOnGame.current) {
      posRef.current = defaultGame;
      setPos(defaultGame);
    }
    wasOnGame.current = onGame;
  }, [onGame, defaultGame.x, defaultGame.y]);

  useEffect(() => {
    const next: Pos = {
      x: Math.min(maxX, Math.max(minX, posRef.current.x)),
      y: Math.min(maxY, Math.max(minY, posRef.current.y)),
    };
    if (next.x !== posRef.current.x || next.y !== posRef.current.y) {
      posRef.current = next;
      setPos(next);
    }
  }, [minX, maxX, minY, maxY]);

  useEffect(() => {
    const nearTop = posRef.current.y < (minY + maxY) / 2;
    Animated.spring(slideAnim, {
      toValue: shouldShow ? 0 : nearTop ? -120 : 120,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();
  }, [shouldShow, slideAnim, minY, maxY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > DRAG_THRESHOLD || Math.abs(g.dy) > DRAG_THRESHOLD,
        onMoveShouldSetPanResponderCapture: (_e, g) =>
          Math.abs(g.dx) > DRAG_THRESHOLD || Math.abs(g.dy) > DRAG_THRESHOLD,
        onPanResponderGrant: () => {
          dragged.current = false;
          dragStart.current = posRef.current;
        },
        onPanResponderMove: (_e, g) => {
          if (Math.abs(g.dx) > DRAG_THRESHOLD || Math.abs(g.dy) > DRAG_THRESHOLD) {
            dragged.current = true;
          }
          const next: Pos = {
            x: Math.min(maxX, Math.max(minX, dragStart.current.x + g.dx)),
            y: Math.min(maxY, Math.max(minY, dragStart.current.y + g.dy)),
          };
          posRef.current = next;
          setPos(next);
        },
        onPanResponderRelease: () => {
          if (dragged.current) {
            setTimeout(() => {
              dragged.current = false;
            }, 80);
          }
        },
      }),
    [minX, maxX, minY, maxY],
  );

  // Unmount entirely once the call is over (user left, host kicked us, the
  // account joined from another device, retries ran out). Keeping the layer
  // mounted left an invisible full-screen view — and a green bar that could
  // re-appear — hanging over the app long after the session was dead.
  if (!controller || !isLive) return null;

  const handleLeave = () => {
    if (dragged.current) return;
    deactivate();
  };

  const handleOpen = () => {
    if (dragged.current) return;
    navigateToVoice(isGuild ? 'guild' : 'team');
  };

  const handleMute = () => {
    if (dragged.current) return;
    controller.toggleMute();
  };

  return (
    <View style={styles.layer} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.wrapper,
          {
            left: pos.x,
            top: pos.y,
            width: BAR_WIDTH,
            opacity: shouldShow ? 1 : 0,
            transform: [{ translateY: slideAnim }],
          },
        ]}
        pointerEvents={shouldShow ? 'auto' : 'none'}
        {...panResponder.panHandlers}
      >
        <Pressable style={styles.pill} onPress={handleOpen} accessibilityLabel="Open voice">
          <View style={styles.liveDot} />
          <Text style={styles.label} numberOfLines={1}>
            {isGuild ? 'Guild Voice' : 'Voice'}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {memberCount} member{memberCount !== 1 ? 's' : ''}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.iconBtn, micOff && styles.iconBtnMuted]}
          onPress={handleMute}
          accessibilityLabel={
            controller.isHostMuted ? 'Muted by host' : controller.isMuted ? 'Unmute' : 'Mute'
          }
        >
          <AppIcon
            name={micOff ? 'mic-off' : 'mic'}
            size={18}
            color={micOff ? '#ef4444' : '#fff'}
          />
        </Pressable>

        <Pressable
          style={[styles.iconBtn, styles.leaveBtn]}
          onPress={handleLeave}
          accessibilityLabel="Leave voice"
        >
          <AppIcon name="phone-down" size={16} color="#fff" />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
    elevation: 10000,
  },
  wrapper: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a2a1a',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 24,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  label: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
    flexShrink: 1,
  },
  sub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    flexShrink: 1,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnMuted: {
    backgroundColor: 'rgba(239,68,68,0.15)',
  },
  leaveBtn: {
    backgroundColor: '#dc2626',
  },
});
