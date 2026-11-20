import React, { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { getLinkPreview } from '../../api/chat';
import { LinkPreview } from '../../api/types';
import { ThemeColors } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';

/**
 * Lazily fetches and renders an Open Graph preview card for the first link
 * in a text message. Renders nothing while loading or if the fetch fails /
 * the page had no usable metadata — a missing card is never worse than a
 * wrong one, and the raw link text is still right there in the bubble.
 */
export function LinkPreviewCard({ url, isMine }: { url: string; isMine: boolean }) {
  const styles = useThemedStyles(cardStyles);
  const [preview, setPreview] = useState<LinkPreview | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setPreview(undefined);
    getLinkPreview(url).then((p) => {
      if (!cancelled) setPreview(p);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!preview || (!preview.title && !preview.image && !preview.description)) return null;

  return (
    <Pressable
      style={[styles.card, isMine && styles.cardMine]}
      onPress={() => void Linking.openURL(url).catch(() => undefined)}
      accessibilityRole="link"
      accessibilityLabel={preview.title ?? url}
    >
      {preview.image ? (
        <Image
          source={{ uri: preview.image }}
          style={staticStyles.image}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : null}
      <View style={staticStyles.textCol}>
        {preview.siteName ? (
          <Text style={styles.site} numberOfLines={1}>
            {preview.siteName.toUpperCase()}
          </Text>
        ) : null}
        {preview.title ? (
          <Text style={styles.title} numberOfLines={2}>
            {preview.title}
          </Text>
        ) : null}
        {preview.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {preview.description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const staticStyles = StyleSheet.create({
  image: { width: '100%', height: 120 },
  textCol: { padding: 8, gap: 2 },
});

function cardStyles(c: ThemeColors) {
  return {
    card: {
      marginTop: 6,
      borderRadius: 10,
      overflow: 'hidden' as const,
      backgroundColor: 'rgba(0,0,0,0.18)',
      borderWidth: 1,
      borderColor: c.border,
    },
    cardMine: { backgroundColor: 'rgba(0,0,0,0.12)' },
    site: { fontSize: 10, fontWeight: '800' as const, letterSpacing: 0.5, color: c.textDim },
    title: { fontSize: 13, fontWeight: '700' as const, color: c.text },
    description: { fontSize: 12, color: c.textMuted },
  };
}
