import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
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
import { colors } from '../../theme';
import {
  cacheGet,
  cacheSet,
  CacheKeys,
  cacheInvalidate,
} from '../../api/queryCache';
import { useOrgRealtimeOptional } from '../../realtime/OrgRealtimeProvider';
import { MediaViewerModal } from '../chat/MediaViewerModal';

type Props = NativeStackScreenProps<MainStackParamList, 'MediaFeed'>;

export function MediaFeedScreen(_props: Props) {
  const realtime = useOrgRealtimeOptional();
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [selectedUploaderId, setSelectedUploaderId] = useState<string | null>(
    null,
  );
  const [posts, setPosts] = useState<MediaPost[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewer, setViewer] = useState<{
    type: 'IMAGE' | 'VIDEO';
    uri: string;
  } | null>(null);

  const loadMembers = useCallback(async (opts?: { force?: boolean }) => {
    const key = 'org:members';
    if (!opts?.force) {
      const cached = cacheGet<OrgMember[]>(key);
      if (cached) {
        setMembers(cached);
        return;
      }
    }
    const org = await orgApi.getMyOrg();
    cacheSet(key, org.members);
    setMembers(org.members);
  }, []);

  const loadPosts = useCallback(
    async (uploaderId: string | null, opts?: { force?: boolean }) => {
      const key = CacheKeys.mediaList(uploaderId);
      if (!opts?.force) {
        const cached = cacheGet<MediaPost[]>(key);
        if (cached) {
          setPosts(cached);
          return;
        }
      }
      const data = await mediaApi.listMedia(uploaderId ?? undefined);
      cacheSet(key, data);
      setPosts(data);
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
      <View style={styles.root}>
        <View style={styles.filterBar}>
          <FlatList
            horizontal
            data={[{ userId: null, name: 'All' } as const, ...members]}
            keyExtractor={(item) => item.userId ?? 'all'}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            renderItem={({ item }) => {
              const isActive = selectedUploaderId === item.userId;
              return (
                <SoftPressable
                  onPress={() => setSelectedUploaderId(item.userId)}
                  style={[styles.chip, isActive && styles.chipActive]}
                  pressScale={0.96}
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
          style={styles.list}
          data={posts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>No uploads yet.</Text>
          }
          renderItem={({ item }) => {
            const uri = resolveMediaUrl(item.url) ?? '';
            return (
              <SoftPressable
                style={styles.postRow}
                onPress={() => setViewer({ type: item.type, uri })}
                accessibilityRole="button"
                accessibilityLabel={
                  item.type === 'IMAGE' ? 'View image' : 'View video'
                }
                pressScale={0.985}
              >
                {item.type === 'IMAGE' ? (
                  <Image source={{ uri }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.videoThumb]}>
                    <Text style={{ color: colors.text }}>▶</Text>
                  </View>
                )}
                <View style={styles.postMeta}>
                  <Text style={styles.uploader}>{item.uploaderName}</Text>
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  filterBar: {
    zIndex: 2,
    elevation: 4,
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    paddingTop: 8,
    paddingBottom: 10,
  },
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
  chipActive: {
    backgroundColor: colors.chrome,
    borderColor: colors.chrome,
  },
  chipText: { color: colors.textMuted, fontWeight: '600' },
  chipTextActive: { color: colors.chromeInk, fontWeight: '700' },
  list: { flex: 1, zIndex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: 24,
  },
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
  uploader: {
    fontWeight: '700',
    color: colors.text,
    fontSize: 15,
  },
  caption: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  time: {
    color: colors.textDim,
    fontSize: 11,
    marginTop: 4,
  },
});
