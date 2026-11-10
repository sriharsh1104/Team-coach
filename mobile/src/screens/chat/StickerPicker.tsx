import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ThemeColors } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { useTheme } from '../../theme/ThemeContext';
import {
  BUILTIN_STICKERS,
  CustomSticker,
  addCustomSticker,
  loadCustomStickers,
  removeCustomSticker,
} from './stickerStorage';

type Props = {
  onPickBuiltin: (emoji: string) => void;
  onPickCustom: (sticker: CustomSticker) => void;
};

export function StickerPicker({ onPickBuiltin, onPickCustom }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(stickerPickerStyles);
  const [custom, setCustom] = useState<CustomSticker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadCustomStickers()
      .then((list) => {
        if (!cancelled) setCustom(list);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onAdd = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow gallery access to add stickers.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const list = await addCustomSticker({
      uri: asset.uri,
      fileName: asset.fileName ?? `sticker-${Date.now()}.png`,
      mimeType: asset.mimeType ?? 'image/png',
    });
    setCustom(list);
  };

  const onLongPressCustom = (sticker: CustomSticker) => {
    Alert.alert('Remove sticker?', 'This only removes it from your pack.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void removeCustomSticker(sticker.id).then(setCustom);
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={staticStyles.root}
      contentContainerStyle={staticStyles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.section}>Pack</Text>
      <View style={staticStyles.grid}>
        {BUILTIN_STICKERS.map((emoji) => (
          <Pressable
            key={emoji}
            onPress={() => onPickBuiltin(emoji)}
            style={styles.cell}
            accessibilityLabel={`Sticker ${emoji}`}
          >
            <Text style={staticStyles.emoji}>{emoji}</Text>
          </Pressable>
        ))}
      </View>

      <View style={staticStyles.mineHeader}>
        <Text style={styles.section}>My stickers</Text>
        <Pressable
          onPress={() => void onAdd()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Add sticker"
        >
          <Text style={styles.addBtn}>+ Add</Text>
        </Pressable>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.chrome} style={{ marginVertical: 12 }} />
      ) : custom.length === 0 ? (
        <Text style={styles.empty}>
          Tap + Add to save images from your gallery as stickers.
        </Text>
      ) : (
        <View style={staticStyles.grid}>
          {custom.map((stk) => (
            <Pressable
              key={stk.id}
              onPress={() => onPickCustom(stk)}
              onLongPress={() => onLongPressCustom(stk)}
              delayLongPress={400}
              style={styles.cell}
              accessibilityLabel="Custom sticker"
            >
              <Image
                source={{ uri: stk.uri }}
                style={staticStyles.thumb}
                contentFit="contain"
              />
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  root: { maxHeight: 220 },
  content: { paddingHorizontal: 12, paddingBottom: 8 },
  mineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  emoji: { fontSize: 32 },
  thumb: { width: 48, height: 48 },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function stickerPickerStyles(c: ThemeColors) {
  return {
    cell: {
      width: 56,
      height: 56,
      borderRadius: 12,
      backgroundColor: c.surface,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      overflow: 'hidden' as const,
    },
    section: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: '700' as const,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.6,
      marginBottom: 8,
      marginTop: 4,
    },
    addBtn: { color: c.link, fontWeight: '700' as const, fontSize: 13 },
    empty: {
      color: c.textDim,
      fontSize: 12,
      marginBottom: 8,
      lineHeight: 18,
    },
  };
}
