import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as mediaApi from '../../api/media';
import * as orgApi from '../../api/org';
import { resolveMediaUrl } from '../../api/client';
import { MediaPost, OrgMember } from '../../api/types';
import { MainStackParamList } from '../../navigation/types';
import { Screen } from '../../brand/Screen';
import { SoftPressable } from '../../ui/SoftPressable';
import { SkeletonList } from '../../ui/Skeleton';
import { Image } from 'expo-image';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import {
  CacheKeys,
  cacheInvalidate,
  hasFreshEnough,
  revalidate,
} from '../../api/queryCache';
import { useOrgRealtimeOptional } from '../../realtime/OrgRealtimeProvider';
import { MediaViewerModal } from '../chat/MediaViewerModal';

type Props = NativeStackScreenProps<MainStackParamList, 'MediaFeed'>;

export function MediaFeedScreen({ navigation }: Props) {
  const realtime = useOrgRealtimeOptional();
  const { colors } = useTheme();
  const styles = useThemedStyles(mediaFeedStyles);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [selectedUploaderId, setSelectedUploaderId] = useState<string | null>(
    null,
  );
  const [posts, setPosts] = useState<MediaPost[]>([]);
  /** False until the first fetch for the current filter resolves — otherwise
   * the list shows "No uploads yet" while the request is still in flight. */
  const [postsReady, setPostsReady] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewer, setViewer] = useState<{
    type: 'IMAGE' | 'VIDEO';
    uri: string;
  } | null>(null);

  const loadMembers = useCallback(async (opts?: { force?: boolean }) => {
    await revalidate(
      CacheKeys.orgMembers(),
      async () => (await orgApi.getMyOrg()).members,
      setMembers,
      opts,
    );
  }, []);

  const loadPosts = useCallback(
    async (uploaderId: string | null, opts?: { force?: boolean }) => {
      const key = CacheKeys.mediaList(uploaderId);
      // Only an uncached filter gets skeletons; switching back to one we've
      // already seen paints from cache and refreshes behind the content.
      if (!opts?.force && !hasFreshEnough(key)) setPostsReady(false);
      try {
        await revalidate(
          key,
          () => mediaApi.listMedia(uploaderId ?? undefined),
          setPosts,
          opts,
        );
      } finally {
        // A failed fetch still ends the loading state — the axios
        // interceptor toasts the error; the list shouldn't pulse forever.
        setPostsReady(true);
      }
    },
    [],
  );

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    void loadPosts(selectedUploaderId);
  }, [selectedUploaderId, loadPosts]);

  useEffect(() => {
    if (!realtime) return;
    return realtime.subscribe((event) => {
      if (event.type !== 'media.changed') return;
      void loadPosts(selectedUploaderId, { force: true });
    });
  }, [realtime, loadPosts, selectedUploaderId]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    cacheInvalidate('media:');
    cacheInvalidate('org:members');
    await Promise.all([
      loadMembers({ force: true }),
      loadPosts(selectedUploaderId, { force: true }),
    ]);
    setIsRefreshing(false);
  };

  return (
    <Screen>
      <View style={staticStyles.root}>
        <View style={styles.filterBar}>
          <FlatList
            horizontal
            data={[{ userId: null, name: 'All' } as const, ...members]}
            keyExtractor={(item) => item.userId ?? 'all'}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={staticStyles.chipRow}
            renderItem={({ item }) => {
              const isActive = selectedUploaderId === item.userId;
              return (
                <SoftPressable
                  onPress={() => setSelectedUploaderId(item.userId)}
                  style={[staticStyles.chip, isActive && styles.chipActive]}
                  pressScale={0.96}
                  haptic={false}
                >
                  <Text
                    style={isActive ? styles.chipTextActive : styles.chipText}
                  >
                    {item.name}
                  </Text>
                </SoftPressable>
              );
            }}
          />
        </View>

        <FlatList
          style={staticStyles.list}
          data={posts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={staticStyles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            postsReady ? (
              <Text style={styles.empty}>No uploads yet.</Text>
            ) : (
              <SkeletonList count={5} avatarSize={56} />
            )
          }
          renderItem={({ item }) => {
            const uri = resolveMediaUrl(item.url) ?? '';
            return (
              <SoftPressable
                style={staticStyles.postRow}
                onPress={() => setViewer({ type: item.type, uri })}
                accessibilityRole="button"
                accessibilityLabel={
                  item.type === 'IMAGE' ? 'View image' : 'View video'
                }
                pressScale={0.985}
                haptic={false}
              >
                {item.type === 'IMAGE' ? (
                  <Image
                    source={{ uri }}
                    style={staticStyles.thumb}
                    contentFit="cover"
                    // Thumbnails re-download on every scroll back without this.
                    cachePolicy="memory-disk"
                    recyclingKey={item.id}
                    transition={150}
                    placeholder={{ color: 'rgba(128,128,128,0.15)' }}
                  />
                ) : (
                  <View style={[staticStyles.thumb, staticStyles.videoThumb]}>
                    <Text style={{ color: colors.text }}>▶</Text>
                  </View>
                )}
                <View style={staticStyles.postMeta}>
                  <SoftPressable
                    onPress={() =>
                      navigation.push('MemberProfile', {
                        userId: item.uploaderId,
                        name: item.uploaderName,
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`${item.uploaderName} profile`}
                    pressScale={0.97}
                    haptic={false}
                  >
                    <Text style={styles.uploader}>{item.uploaderName}</Text>
                  </SoftPressable>
                  {item.caption ? (
                    <Text numberOfLines={2} style={styles.caption}>
                      {item.caption}
                    </Text>
                  ) : null}
                  <Text style={styles.time}>
                    {new Date(item.createdAt).toLocaleString()}
                  </Text>
                </View>
              </SoftPressable>
            );
          }}
        />
        <MediaViewerModal
          visible={!!viewer}
          type={viewer?.type ?? null}
          uri={viewer?.uri ?? null}
          onClose={() => setViewer(null)}
        />
      </View>
    </Screen>
  );
}

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  root: { flex: 1 },
  chipRow: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  list: { flex: 1, zIndex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  postRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(18,18,22,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  videoThumb: { alignItems: 'center', justifyContent: 'center' },
  postMeta: { flex: 1, marginLeft: 12, minWidth: 0 },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function mediaFeedStyles(c: ThemeColors) {
  return {
    filterBar: {
      zIndex: 2,
      elevation: 4,
      backgroundColor: c.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: 'rgba(255,255,255,0.08)',
      paddingTop: 8,
      paddingBottom: 10,
    },
    chipActive: {
      backgroundColor: c.chrome,
      borderColor: c.chrome,
    },
    chipText: { color: c.textMuted, fontWeight: '600' as const },
    chipTextActive: { color: c.chromeInk, fontWeight: '700' as const },
    empty: {
      textAlign: 'center' as const,
      color: c.textMuted,
      marginTop: 24,
    },
    uploader: {
      fontWeight: '700' as const,
      color: c.text,
      fontSize: 15,
    },
    caption: {
      color: c.textMuted,
      fontSize: 13,
      marginTop: 2,
      lineHeight: 18,
    },
    time: {
      color: c.textDim,
      fontSize: 11,
      marginTop: 4,
    },
  };
}
