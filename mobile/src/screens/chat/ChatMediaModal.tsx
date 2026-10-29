import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  FlatList,
  Image,
  Linking,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import * as chatApi from '../../api/chat';
import { ChatMessage } from '../../api/types';
import { colors } from '../../theme';
import { MediaViewerModal } from './MediaViewerModal';

type GalleryTab = 'media' | 'docs' | 'links';

const URL_REGEX = /https?:\/\/\S+/i;

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
  const [tab, setTab] = useState<GalleryTab>('media');
  const [media, setMedia] = useState<ChatMessage[]>([]);
  const [links, setLinks] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [viewerMedia, setViewerMedia] = useState<{
    type: 'IMAGE' | 'VIDEO';
    uri: string;
  } | null>(null);

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
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.tabRow}>
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
            contentContainerStyle={styles.grid}
            ListEmptyComponent={<Text style={styles.empty}>No media shared yet.</Text>}
            renderItem={({ item }) => {
              const uri = chatApi.resolveChatMediaUrl(item.mediaUrl);
              if (!uri) return null;
              const isVideo = item.mediaType === 'VIDEO';
              return (
                <Pressable
                  style={styles.thumbWrap}
                  onPress={() => setViewerMedia({ type: isVideo ? 'VIDEO' : 'IMAGE', uri })}
                >
                  {isVideo ? (
                    <View style={[styles.thumb, styles.videoThumb]}>
                      <Text style={styles.playIcon}>▶</Text>
                    </View>
                  ) : (
                    <Image source={{ uri }} style={styles.thumb} />
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
            contentContainerStyle={styles.linkList}
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
      </View>

      <MediaViewerModal
        visible={!!viewerMedia}
        type={viewerMedia?.type ?? null}
        uri={viewerMedia?.uri ?? null}
        onClose={() => setViewerMedia(null)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 12,
  },
  closeText: { color: colors.link, fontWeight: '700' },
  title: { flex: 1, color: colors.text, fontWeight: '700', fontSize: 16, textAlign: 'center' },
  headerSpacer: { width: 44 },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  tab: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: 8,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: colors.chrome, borderColor: colors.chrome },
  tabText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  tabTextActive: { color: colors.chromeInk, fontWeight: '700', fontSize: 13 },
  grid: { padding: 4 },
  thumbWrap: { width: '33.33%', aspectRatio: 1, padding: 2 },
  thumb: { width: '100%', height: '100%', borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.06)' },
  videoThumb: { alignItems: 'center', justifyContent: 'center' },
  playIcon: { color: colors.text, fontSize: 24 },
  linkList: { padding: 16 },
  linkRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  linkUrl: { color: colors.link, fontWeight: '600', fontSize: 14 },
  linkMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 24 },
});
