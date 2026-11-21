import React, { useState } from 'react';
import { Alert, Modal, View, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { AppIcon } from '../../ui/AppIcon';
import { saveMediaToGallery } from './saveMediaToGallery';

interface Props {
  visible: boolean;
  type: 'IMAGE' | 'VIDEO' | null;
  uri: string | null;
  onClose: () => void;
}

/** Full-screen in-app viewer for a chat image/video — tapping a thumbnail
 * opens this instead of handing off to an external browser/app. */
export function MediaViewerModal({ visible, type, uri, onClose }: Props) {
  const [saving, setSaving] = useState(false);

  const onDownload = async () => {
    if (!uri || !type || saving) return;
    setSaving(true);
    try {
      await saveMediaToGallery(uri, type);
    } catch {
      Alert.alert('Download failed', 'Could not save this media. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible && !!uri} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.topBar}>
          <Pressable
            style={styles.iconBtn}
            onPress={() => void onDownload()}
            accessibilityLabel="Save to gallery"
            hitSlop={12}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <AppIcon name="download-outline" size={22} color="#fff" />
            )}
          </Pressable>
          <Pressable
            style={styles.iconBtn}
            onPress={onClose}
            accessibilityLabel="Close viewer"
            hitSlop={12}
          >
            <AppIcon name="close" size={22} color="#fff" />
          </Pressable>
        </View>
        {uri && type === 'IMAGE' && (
          <Image
            source={{ uri }}
            style={styles.media}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
        )}
        {uri && type === 'VIDEO' && (
          <Video
            source={{ uri }}
            style={styles.media}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            isLooping={false}
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
  topBar: {
    position: 'absolute',
    top: 48,
    right: 16,
    zIndex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  media: { width: '100%', height: '80%' },
});
