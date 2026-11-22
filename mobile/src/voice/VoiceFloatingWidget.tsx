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
import { useNavigation, useNavigationState } from '@react-navigation/native';
import type { NavigationState, PartialState } from '@react-navigation/native';
import { useVoiceContext } from './VoiceContext';
import { AppIcon } from '../ui/AppIcon';

const BAR_HEIGHT = 56;
const EDGE_PAD = 16;
const DRAG_THRESHOLD = 8;

type NavState = NavigationState | PartialState<NavigationState> | undefined;

function getFocusedRouteName(state: NavState): string | undefined {
  if (!state || !('routes' in state) || !state.routes?.length) return undefined;
  const index = state.index ?? state.routes.length - 1;
  const route = state.routes[index];
  if (!route) return undefined;
  if (route.state) return getFocusedRouteName(route.state) ?? route.name;
  return route.name;
}

function isGameRoute(name: string | undefined): boolean {
  return name === 'GameRoom' || name === 'Games';
}

/**
 * Floating PiP-style widget shown when the user has an active voice session
 * but has navigated away from the Voice screen. Provides quick mute/unmute
 * and leave controls without returning to the Voice screen.
 *
 * Vertically draggable. Defaults to the bottom; on Games / GameRoom it
 * starts at the top so it does not cover game controls.
 */
export function VoiceFloatingWidget() {
  const { controller, isScreenFocused, deactivate } = useVoiceContext();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const focusedRoute = useNavigationState(getFocusedRouteName);
  const onGame = isGameRoute(focusedRoute);

  const windowH = Dimensions.get('window').height;
  const minTop = insets.top + EDGE_PAD;
  const maxTop = Math.max(minTop, windowH - insets.bottom - EDGE_PAD - BAR_HEIGHT);
  const defaultBottomTop = maxTop;
  const defaultGameTop = minTop;

  const [top, setTop] = useState(defaultBottomTop);
  const topRef = useRef(top);
  const dragStartTop = useRef(top);
  const dragged = useRef(false);
  const slideAnim = useRef(new Animated.Value(120)).current;

  const isConnected = controller?.status === 'connected';
  const isGuild = controller?.room === 'guild';
  const micOff = !!controller && (controller.isMuted || !!controller.isHostMuted);
  const shouldShow = isConnected && !isScreenFocused;

  // participants[] excludes self; roomCount (when present) already includes everyone.
  const memberCount =
    controller?.roomCount ??
    (controller ? controller.participants.length + (isConnected ? 1 : 0) : 0);

  // Entering a game screen → pin to top by default (once per enter).
  const wasOnGame = useRef(false);
  useEffect(() => {
    if (onGame && !wasOnGame.current) {
      topRef.current = defaultGameTop;
      setTop(defaultGameTop);
    }
    wasOnGame.current = onGame;
  }, [onGame, defaultGameTop]);

  // Keep within bounds if safe area / window changes.
  useEffect(() => {
    const clamped = Math.min(maxTop, Math.max(minTop, topRef.current));
    if (clamped !== topRef.current) {
      topRef.current = clamped;
      setTop(clamped);
    }
  }, [minTop, maxTop]);

  useEffect(() => {
    const nearTop = topRef.current < (minTop + maxTop) / 2;
    Animated.spring(slideAnim, {
      toValue: shouldShow ? 0 : nearTop ? -120 : 120,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();
  }, [shouldShow, slideAnim, minTop, maxTop]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dy) > DRAG_THRESHOLD && Math.abs(g.dy) > Math.abs(g.dx),
        onMoveShouldSetPanResponderCapture: (_e, g) =>
          Math.abs(g.dy) > DRAG_THRESHOLD && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: () => {
          dragged.current = false;
          dragStartTop.current = topRef.current;
        },
        onPanResponderMove: (_e, g) => {
          if (Math.abs(g.dy) > DRAG_THRESHOLD) dragged.current = true;
          const next = Math.min(maxTop, Math.max(minTop, dragStartTop.current + g.dy));
          topRef.current = next;
          setTop(next);
        },
        onPanResponderRelease: () => {
          // Snap toward nearest edge so the bar stays out of the way.
          const mid = (minTop + maxTop) / 2;
          const snapped = topRef.current < mid ? minTop : maxTop;
          topRef.current = snapped;
          setTop(snapped);
          // Suppress the trailing Pressable tap that follows a drag.
          if (dragged.current) {
            setTimeout(() => {
              dragged.current = false;
            }, 80);
          }
        },
      }),
    [minTop, maxTop],
  );

  if (!controller) return null;

  const handleLeave = () => {
    if (dragged.current) return;
    deactivate();
  };

  const handleOpen = () => {
    if (dragged.current) return;
    if (isGuild) navigation.navigate('GuildVoice');
    else navigation.navigate('OrgHome', { screen: 'Voice' });
  };

  const handleMute = () => {
    if (dragged.current) return;
    controller.toggleMute();
  };

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          top,
          transform: [{ translateY: slideAnim }],
        },
      ]}
      pointerEvents={shouldShow ? 'auto' : 'none'}
      {...panResponder.panHandlers}
    >
      <Pressable style={styles.pill} onPress={handleOpen} accessibilityLabel="Open voice">
        {/* Green dot = live */}
        <View style={styles.liveDot} />
        <Text style={styles.label}>{isGuild ? 'Guild Voice' : 'Voice'}</Text>
        <Text style={styles.sub}>
          {memberCount} member{memberCount !== 1 ? 's' : ''}
        </Text>
      </Pressable>

      {/* Mute / unmute */}
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

      {/* Leave */}
      <Pressable
        style={[styles.iconBtn, styles.leaveBtn]}
        onPress={handleLeave}
        accessibilityLabel="Leave voice"
      >
        <AppIcon name="phone-down" size={16} color="#fff" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a2a1a',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
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
  },
  label: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  sub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
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
