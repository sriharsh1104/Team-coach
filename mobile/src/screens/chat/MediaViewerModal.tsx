import React from 'react';
import { Modal, View, Image, Pressable, Text, StyleSheet } from 'react-native';
import { Video, ResizeMode } from 'expo-av';

interface Props {
  visible: boolean;
  type: 'IMAGE' | 'VIDEO' | null;
  uri: string | null;
  onClose: () => void;
}

/** Full-screen in-app viewer for a chat image/video — tapping a thumbnail
 * opens this instead of handing off to an external browser/app. */
export function MediaViewerModal({ visible, type, uri, onClose }: Props) {
  return (
    <Modal visible={visible && !!uri} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          style={styles.closeBtn}
          onPress={onClose}
          accessibilityLabel="Close viewer"
          hitSlop={12}
        >
          <Text style={styles.closeIcon}>✕</Text>
        </Pressable>
        {uri && type === 'IMAGE' && (
          <Image source={{ uri }} style={styles.media} resizeMode="contain" />
        )}
        {uri && type === 'VIDEO' && (
          <Video
            source={{ uri }}
            style={styles.media}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  media: { width: '100%', height: '80%' },
});
