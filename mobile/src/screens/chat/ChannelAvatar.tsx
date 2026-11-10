import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { resolveMediaUrl } from '../../api/client';
import { ThemeColors } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { SoftPressable } from '../../ui/SoftPressable';

type Props = {
  uri: string | null | undefined;
  size?: number;
  fallback?: string;
  /** When true, tap opens a full-screen preview (group banner / photo). */
  previewable?: boolean;
};

/** Circular channel / group avatar with optional full-screen preview. */
export function ChannelAvatar({
  uri,
  size = 36,
  fallback = '◈',
  previewable = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const styles = useThemedStyles(avatarStyles);
  const resolved = resolveMediaUrl(uri);
  const radius = size / 2;

  const body = (
    <View
      style={[
        staticStyles.circle,
        {
          width: size,
          height: size,
          borderRadius: radius,
        },
      ]}
    >
      {resolved ? (
        <Image
          source={{ uri: resolved }}
          style={staticStyles.img}
          contentFit="cover"
        />
      ) : (
        <Text style={[styles.fallback, { fontSize: size * 0.38 }]}>
          {fallback}
        </Text>
      )}
    </View>
  );

  if (!previewable || !resolved) {
    return body;
  }

  return (
    <>
      <SoftPressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="View group photo"
        hitSlop={6}
        pressScale={0.94}
      >
        {body}
      </SoftPressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={staticStyles.backdrop}>
          <Pressable
            style={staticStyles.closeBtn}
            onPress={() => setOpen(false)}
            accessibilityLabel="Close"
            hitSlop={12}
          >
            <Text style={staticStyles.closeIcon}>✕</Text>
          </Pressable>
          <Image
            source={{ uri: resolved }}
            style={staticStyles.full}
            contentFit="contain"
          />
        </View>
      </Modal>
    </>
  );
}

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(201,204,209,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  img: { width: '100%', height: '100%' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 1,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: { color: '#fff', fontSize: 18, fontWeight: '700' },
  full: { width: '100%', height: '80%' },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function avatarStyles(c: ThemeColors) {
  return {
    fallback: { color: c.chrome, fontWeight: '700' as const },
  };
}
