import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  View,
  Text,
  Pressable,
  FlatList,
  Linking,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import * as chatApi from '../../api/chat';
import { ChatMessage } from '../../api/types';
import { ThemeColors } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { useTheme } from '../../theme/ThemeContext';
import { MediaViewerModal } from './MediaViewerModal';

type GalleryTab = 'media' | 'docs' | 'links';

const URL_REGEX = /https?:\/\/\S+/i;
const SCREEN_WIDTH = Dimensions.get('window').width;
// Tests render synchronously and don't advance RN's Animated clock — skip
// straight to the resting position so content is visible to query right away
// (same convention as ui/SideDrawer.tsx).
const SKIP_MOTION = process.env.NODE_ENV === 'test';

interface Props {
  visible: boolean;
  channelKey: string;
  title: string;
  onClose: () => void;
}

/** WhatsApp-style "chat info" gallery — media/docs/links shared in this one
 * channel only, opened from the conversation header. Docs always shows the
 * empty state: chat only ever attaches images/videos, no document uploads. */
export function ChatMediaModal({ visible, channelKey, title, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(mediaModalStyles);
  const [tab, setTab] = useState<GalleryTab>('media');
  const [media, setMedia] = useState<ChatMessage[]>([]);
  const [links, setLinks] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [viewerMedia, setViewerMedia] = useState<{
    type: 'IMAGE' | 'VIDEO';
    uri: string;
  } | null>(null);
  // Slides in from the right edge instead of RN's default bottom-up sheet —
  // matches ui/SideDrawer.tsx's left-side drawer, mirrored to the other edge.
  const slide = useRef(new Animated.Value(SCREEN_WIDTH)).current;

  useEffect(() => {
    if (SKIP_MOTION) {
      slide.setValue(visible ? 0 : SCREEN_WIDTH);
      return;
    }
    Animated.timing(slide, {
      toValue: visible ? 0 : SCREEN_WIDTH,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [visible, slide]);

  useEffect(() => {
    if (!visible) return;
    setTab('media');
    setIsLoading(true);
    Promise.all([chatApi.getChatMedia(channelKey), chatApi.getChatLinks(channelKey)])
      .then(([mediaRes, linksRes]) => {
        setMedia(mediaRes);
        setLinks(linksRes);
      })
      .finally(() => setIsLoading(false));
  }, [visible, channelKey]);

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <Animated.View
        style={[styles.root, { transform: [{ translateX: slide }] }]}
      >
        <View style={staticStyles.header}>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <View style={staticStyles.headerSpacer} />
        </View>

        <View style={staticStyles.tabRow}>
          {(
            [
              ['media', 'Media'],
              ['docs', 'Docs'],
              ['links', 'Links'],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              style={[styles.tab, tab === value && styles.tabActive]}
              onPress={() => setTab(value)}
            >
              <Text style={tab === value ? styles.tabTextActive : styles.tabText}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.chrome} style={{ marginTop: 24 }} />
        ) : tab === 'media' ? (
          <FlatList
            data={media}
            numColumns={3}
            key="media-grid"
            keyExtractor={(item) => item.id}
            contentContainerStyle={staticStyles.grid}
            ListEmptyComponent={<Text style={styles.empty}>No media shared yet.</Text>}
            renderItem={({ item }) => {
              const uri = chatApi.resolveChatMediaUrl(item.mediaUrl);
              if (!uri) return null;
              const isVideo = item.mediaType === 'VIDEO';
              return (
                <Pressable
                  style={staticStyles.thumbWrap}
                  onPress={() => setViewerMedia({ type: isVideo ? 'VIDEO' : 'IMAGE', uri })}
                >
                  {isVideo ? (
                    <View style={[styles.thumb, staticStyles.videoThumb]}>
                      <Text style={styles.playIcon}>▶</Text>
                    </View>
                  ) : (
                    <Image
                      source={{ uri }}
                      style={styles.thumb}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      recyclingKey={item.id}
                    />
                  )}
                </Pressable>
              );
            }}
          />
        ) : tab === 'docs' ? (
          <Text style={styles.empty}>No documents shared yet.</Text>
        ) : (
          <FlatList
            data={links}
            key="links-list"
            keyExtractor={(item) => item.id}
            contentContainerStyle={staticStyles.linkList}
            ListEmptyComponent={<Text style={styles.empty}>No links shared yet.</Text>}
            renderItem={({ item }) => {
              const url = item.text?.match(URL_REGEX)?.[0];
              return (
                <Pressable
                  style={styles.linkRow}
                  disabled={!url}
                  onPress={() => url && Linking.openURL(url)}
                >
                  <Text style={styles.linkUrl} numberOfLines={1}>
                    {url ?? item.text}
                  </Text>
                  <Text style={styles.linkMeta}>
                    {item.senderName} · {new Date(item.createdAt).toLocaleDateString()}
                  </Text>
                </Pressable>
              );
            }}
          />
        )}
      </Animated.View>

      <MediaViewerModal
        visible={!!viewerMedia}
        type={viewerMedia?.type ?? null}
        uri={viewerMedia?.uri ?? null}
        onClose={() => setViewerMedia(null)}
      />
    </Modal>
  );
}

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 12,
  },
  headerSpacer: { width: 44 },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  grid: { padding: 4 },
  thumbWrap: { width: '33.33%', aspectRatio: 1, padding: 2 },
  videoThumb: { alignItems: 'center', justifyContent: 'center' },
  linkList: { padding: 16 },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function mediaModalStyles(c: ThemeColors) {
  return {
    thumb: {
      width: '100%' as const,
      height: '100%' as const,
      borderRadius: 4,
      backgroundColor: c.surface,
    },
    root: { flex: 1, backgroundColor: c.bg },
    closeText: { color: c.link, fontWeight: '700' as const },
    title: {
      flex: 1,
      color: c.text,
      fontWeight: '700' as const,
      fontSize: 16,
      textAlign: 'center' as const,
    },
    tab: {
      flex: 1,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 20,
      paddingVertical: 8,
      alignItems: 'center' as const,
    },
    tabActive: { backgroundColor: c.chrome, borderColor: c.chrome },
    tabText: { color: c.text, fontWeight: '600' as const, fontSize: 13 },
    tabTextActive: { color: c.chromeInk, fontWeight: '700' as const, fontSize: 13 },
    playIcon: { color: c.text, fontSize: 24 },
    linkRow: {
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    linkUrl: { color: c.link, fontWeight: '600' as const, fontSize: 14 },
    linkMeta: { color: c.textMuted, fontSize: 12, marginTop: 2 },
    empty: { textAlign: 'center' as const, color: c.textMuted, marginTop: 24 },
  };
}
