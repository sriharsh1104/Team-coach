import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useVoiceContext } from './VoiceContext';
import { AppIcon } from '../ui/AppIcon';

/**
 * Floating PiP-style widget shown when the user has an active voice session
 * but has navigated away from the Voice screen. Provides quick mute/unmute
 * and leave controls without returning to the Voice screen.
 */
export function VoiceFloatingWidget() {
  const { controller, isScreenFocused, deactivate } = useVoiceContext();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const slideAnim = useRef(new Animated.Value(120)).current;

  const isConnected = controller?.status === 'connected';
  const shouldShow = isConnected && !isScreenFocused;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: shouldShow ? 0 : 120,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();
  }, [shouldShow, slideAnim]);

  if (!controller) return null;

  const handleLeave = () => {
    deactivate();
  };

  const handleOpen = () => {
    navigation.navigate('OrgHome', { screen: 'Voice' });
  };

  return (
    <Animated.View
      style={[
        styles.wrapper,
        { bottom: insets.bottom + 16, transform: [{ translateY: slideAnim }] },
      ]}
      pointerEvents={shouldShow ? 'auto' : 'none'}
    >
      <Pressable style={styles.pill} onPress={handleOpen} accessibilityLabel="Open voice">
        {/* Green dot = live */}
        <View style={styles.liveDot} />
        <Text style={styles.label}>Voice</Text>
        <Text style={styles.sub}>
          {controller.participants.length} member{controller.participants.length !== 1 ? 's' : ''}
        </Text>
      </Pressable>

      {/* Mute / unmute */}
      <Pressable
        style={[styles.iconBtn, controller.isMuted && styles.iconBtnMuted]}
        onPress={() => controller.toggleMute()}
        accessibilityLabel={controller.isMuted ? 'Unmute' : 'Mute'}
      >
        <AppIcon
          name={controller.isMuted ? 'mic-off' : 'mic'}
          size={18}
          color={controller.isMuted ? '#ef4444' : '#fff'}
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
