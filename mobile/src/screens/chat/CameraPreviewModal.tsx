import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { ResizeMode, Video } from 'expo-av';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';

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
 * Shown after the user captures a photo / picks a video (or finishes a
 * screen recording), so they confirm ("Send?") instead of it being sent
 * instantly. The media itself previews on a neutral dark stage — same as
 * the full-screen media viewer — but the question + action row below it is
 * themed like every other sheet in the app (ForwardSheet, MessageInfoModal),
 * so it doesn't look like a different app bolted onto the white/lavender themes.
 */
export function CameraPreviewModal({ uri, isVideo = false, hideRetake = false, question, onSend, onRetake, onCancel }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(previewStyles);
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.root}>
        <View style={staticStyles.stage}>
          {uri && isVideo ? (
            <Video
              source={{ uri }}
              style={staticStyles.media}
              resizeMode={ResizeMode.CONTAIN}
              useNativeControls
              shouldPlay={false}
            />
          ) : uri ? (
            <Image source={{ uri }} style={staticStyles.media} contentFit="contain" />
          ) : null}
        </View>
        <View style={styles.sheet}>
          <Text style={styles.question}>
            {question ?? (isVideo ? 'Send this video?' : 'Send this photo?')}
          </Text>
          <View style={staticStyles.row}>
            <Pressable
              style={styles.ghostBtn}
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Discard"
            >
              <Text style={styles.ghostText}>Discard</Text>
            </Pressable>
            {hideRetake ? null : (
              <Pressable
                style={styles.ghostBtn}
                onPress={onRetake}
                accessibilityRole="button"
                accessibilityLabel={isVideo ? 'Choose another video' : 'Retake photo'}
              >
                <Text style={styles.ghostText}>{isVideo ? 'Change' : 'Retake'}</Text>
              </Pressable>
            )}
            <Pressable
              style={[staticStyles.btn, { backgroundColor: colors.chrome }]}
              onPress={onSend}
              accessibilityRole="button"
              accessibilityLabel={isVideo ? 'Send video' : 'Send photo'}
            >
              <Text style={[styles.sendText, { color: colors.chromeInk }]}>Send</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Layout-only — identical across every theme. */
const staticStyles = StyleSheet.create({
  stage: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  media: { width: '100%', height: '100%' },
  row: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/** Theme-dependent — the media stage stays a neutral dark stage (same
 * convention as MediaViewerModal) regardless of theme, but the question +
 * action row below it is a themed sheet like the rest of the app's modals. */
function previewStyles(c: ThemeColors) {
  return {
    root: { flex: 1, backgroundColor: '#000' },
    sheet: {
      backgroundColor: c.bg,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 28,
      borderTopWidth: 1,
      borderTopColor: c.border,
      gap: 12,
    },
    question: { color: c.text, fontSize: 15, fontWeight: '600' as const },
    ghostBtn: {
      flex: 1,
      height: 46,
      borderRadius: 12,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    ghostText: { color: c.text, fontWeight: '600' as const, fontSize: 15 },
    sendText: { fontWeight: '700' as const, fontSize: 15 },
  };
}
