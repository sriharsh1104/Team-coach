import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { ResizeMode, Video } from 'expo-av';
import { useTheme } from '../../theme/ThemeContext';

type Props = {
  /** Local file/content URI of the just-captured photo; null hides the modal. */
  uri: string | null;
  /** Video gets a playable preview; anything else is shown as an image. */
  isVideo?: boolean;
  /** Hide the Retake/Change button (e.g. a finished screen recording). */
  hideRetake?: boolean;
  /** Overrides the default "Send this photo/video?" question. */
  question?: string;
  onSend: () => void;
  onRetake: () => void;
  onCancel: () => void;
};

/**
 * Shown after the user captures a photo / picks a video, so they confirm
 * ("Send?") instead of it being sent instantly.
 */
export function CameraPreviewModal({ uri, isVideo = false, hideRetake = false, question, onSend, onRetake, onCancel }: Props) {
  const { colors } = useTheme();
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={staticStyles.backdrop}>
        {uri && isVideo ? (
          <Video
            source={{ uri }}
            style={staticStyles.image}
            resizeMode={ResizeMode.CONTAIN}
            useNativeControls
            shouldPlay={false}
          />
        ) : uri ? (
          <Image source={{ uri }} style={staticStyles.image} contentFit="contain" />
        ) : null}
        <Text style={staticStyles.question}>
          {question ?? (isVideo ? 'Send this video?' : 'Send this photo?')}
        </Text>
        <View style={staticStyles.row}>
          <Pressable
            style={[staticStyles.btn, staticStyles.btnGhost]}
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Discard"
          >
            <Text style={staticStyles.ghostText}>Discard</Text>
          </Pressable>
          {hideRetake ? null : (
          <Pressable
            style={[staticStyles.btn, staticStyles.btnGhost]}
            onPress={onRetake}
            accessibilityRole="button"
            accessibilityLabel={isVideo ? 'Choose another video' : 'Retake photo'}
          >
            <Text style={staticStyles.ghostText}>{isVideo ? 'Change' : 'Retake'}</Text>
          </Pressable>
          )}
          <Pressable
            style={[staticStyles.btn, { backgroundColor: colors.chrome }]}
            onPress={onSend}
            accessibilityRole="button"
            accessibilityLabel={isVideo ? 'Send video' : 'Send photo'}
          >
            <Text style={[staticStyles.sendText, { color: colors.chromeInk }]}>Send</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const staticStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 32,
  },
  image: { width: '100%', flex: 1 },
  question: { color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: { backgroundColor: 'rgba(255,255,255,0.14)' },
  ghostText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  sendText: { fontWeight: '700', fontSize: 15 },
});
