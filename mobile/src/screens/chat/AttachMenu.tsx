import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { AppIcon, AppIconName } from '../../ui/AppIcon';
import { EmojiBar } from './EmojiBar';
import { StickerPicker } from './StickerPicker';
import { CustomSticker } from './stickerStorage';
import { ThemeColors } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { useTheme } from '../../theme/ThemeContext';

export type AttachOption = 'photo' | 'video' | 'camera' | 'reminder' | 'screenShare';

interface Props {
  onPickMedia: (option: AttachOption) => void;
  onPickEmoji: (emoji: string) => void;
  onPickStickerEmoji: (emoji: string) => void;
  onPickCustomSticker: (sticker: CustomSticker) => void;
}


/**
 * WhatsApp-style "+" attachment panel with modern glyph icons.
 */
export function AttachMenu({
  onPickMedia,
  onPickEmoji,
  onPickStickerEmoji,
  onPickCustomSticker,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(attachMenuStyles);
  const [panel, setPanel] = useState<'root' | 'emoji' | 'stickers'>('root');

  if (panel === 'emoji') {
    return (
      <View style={styles.panel}>
        <View style={staticStyles.emojiHeader}>
          <Pressable
            onPress={() => setPanel('root')}
            hitSlop={8}
            accessibilityLabel="Back to attach options"
          >
            <AppIcon name="chevron-back" size={20} color={colors.link} />
          </Pressable>
          <Text style={styles.emojiHeaderLabel}>Emoji</Text>
        </View>
        <EmojiBar onPick={onPickEmoji} />
      </View>
    );
  }

  if (panel === 'stickers') {
    return (
      <View style={styles.panel}>
        <View style={staticStyles.emojiHeader}>
          <Pressable
            onPress={() => setPanel('root')}
            hitSlop={8}
            accessibilityLabel="Back to attach options"
          >
            <AppIcon name="chevron-back" size={20} color={colors.link} />
          </Pressable>
          <Text style={styles.emojiHeaderLabel}>Stickers</Text>
        </View>
        <StickerPicker
          onPickBuiltin={onPickStickerEmoji}
          onPickCustom={onPickCustomSticker}
        />
      </View>
    );
  }

  const options: Array<{
    key: string;
    label: string;
    icon: AppIconName;
    tint: string;
    onPress: () => void;
  }> = [
    {
      key: 'emoji',
      label: 'Emoji',
      icon: 'happy-outline',
      tint: '#f5a623',
      onPress: () => setPanel('emoji'),
    },
    {
      key: 'stickers',
      label: 'Stickers',
      icon: 'sparkles-outline',
      tint: '#2ec4b6',
      onPress: () => setPanel('stickers'),
    },
    {
      key: 'photo',
      label: 'Photo',
      icon: 'images-outline',
      tint: '#9b59b6',
      onPress: () => onPickMedia('photo'),
    },
    {
      key: 'video',
      label: 'Video',
      icon: 'videocam-outline',
      tint: '#e74c3c',
      onPress: () => onPickMedia('video'),
    },
    {
      key: 'camera',
      label: 'Camera',
      icon: 'camera-outline',
      tint: '#3498db',
      onPress: () => onPickMedia('camera'),
    },
    {
      key: 'screenShare',
      label: 'Screen',
      icon: 'phone-portrait-outline',
      tint: '#e74c3c',
      onPress: () => onPickMedia('screenShare'),
    },
    {
      key: 'reminder',
      label: 'Reminder',
      icon: 'alarm-outline',
      tint: '#e8c547',
      onPress: () => onPickMedia('reminder'),
    },
  ];

  return (
    <View style={styles.panel}>
      <View style={staticStyles.grid}>
        {options.map((opt) => (
          <Pressable
            key={opt.key}
            style={staticStyles.gridItem}
            onPress={opt.onPress}
            accessibilityLabel={opt.label}
          >
            <View style={[staticStyles.gridIcon, { backgroundColor: `${opt.tint}22` }]}>
              <View style={[staticStyles.gridIconInner, { backgroundColor: opt.tint }]}>
                <AppIcon name={opt.icon} size={22} color="#fff" />
              </View>
            </View>
            <Text style={styles.gridLabel}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 14,
    justifyContent: 'flex-start',
  },
  gridItem: { alignItems: 'center', width: 68 },
  gridIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  gridIconInner: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function attachMenuStyles(c: ThemeColors) {
  return {
    panel: {
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: 'rgba(255,255,255,0.03)',
      paddingVertical: 14,
    },
    gridLabel: { color: c.text, fontSize: 12, fontWeight: '600' as const },
    emojiHeaderLabel: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: '700' as const,
      textTransform: 'uppercase' as const,
    },
  };
}
