import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  Linking,
  Alert,
  StyleSheet,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as mediaApi from '../../api/media';
import * as orgApi from '../../api/org';
import * as statsApi from '../../api/stats';
import { apiBaseUrl } from '../../api/client';
import { MediaPost, OrgMember } from '../../api/types';
import { MainStackParamList } from '../../navigation/types';
import { sharedStyles } from '../shared';

type Props = NativeStackScreenProps<MainStackParamList, 'MediaFeed'>;

export function MediaFeedScreen({ navigation }: Props) {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [selectedUploaderId, setSelectedUploaderId] = useState<string | null>(
    null,
  );
  const [posts, setPosts] = useState<MediaPost[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadMembers = useCallback(async () => {
    const org = await orgApi.getMyOrg();
    setMembers(org.members);
  }, []);

  const loadPosts = useCallback(async (uploaderId: string | null) => {
    const data = await mediaApi.listMedia(uploaderId ?? undefined);
    setPosts(data);
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    loadPosts(selectedUploaderId);
  }, [selectedUploaderId, loadPosts]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadMembers(), loadPosts(selectedUploaderId)]);
    setIsRefreshing(false);
  };

  const onExtractStats = async (post: MediaPost) => {
    try {
      const extraction = await statsApi.requestExtraction(post.id);
      navigation.navigate('ExtractionReview', { extraction });
    } catch (err: any) {
      if (err?.response?.status === 409) {
        Alert.alert(
          'Already extracted',
          'This screenshot already has a stat extraction — check Stats > Pending Review.',
        );
      } else {
        Alert.alert(
          'Could not extract stats',
          err?.response?.data?.message?.toString() ?? 'Please try again.',
        );
      }
    }
  };

  return (
    <View style={sharedStyles.container}>
      <Text style={sharedStyles.title}>Media</Text>

      <Pressable
        style={sharedStyles.button}
        onPress={() => navigation.navigate('UploadMedia')}
      >
        <Text style={sharedStyles.buttonText}>Upload Screenshot / Clip</Text>
      </Pressable>

      <FlatList
        horizontal
        data={[{ userId: null, name: 'All' } as const, ...members]}
        keyExtractor={(item) => item.userId ?? 'all'}
        showsHorizontalScrollIndicator={false}
        style={{ marginVertical: 12, flexGrow: 0 }}
        renderItem={({ item }) => {
          const isActive = selectedUploaderId === item.userId;
          return (
            <Pressable
              onPress={() => setSelectedUploaderId(item.userId)}
              style={[styles.chip, isActive && styles.chipActive]}
            >
              <Text style={isActive ? styles.chipTextActive : styles.chipText}>
                {item.name}
              </Text>
            </Pressable>
          );
        }}
      />

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: '#888', marginTop: 24 }}>
            No uploads yet.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.postRow}>
            {item.type === 'IMAGE' ? (
              <Image
                source={{ uri: `${apiBaseUrl}${item.url}` }}
                style={styles.thumb}
              />
            ) : (
              <Pressable
                style={[styles.thumb, styles.videoThumb]}
                onPress={() => Linking.openURL(`${apiBaseUrl}${item.url}`)}
              >
                <Text>▶</Text>
              </Pressable>
            )}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontWeight: '600' }}>{item.uploaderName}</Text>
              {item.caption && <Text numberOfLines={2}>{item.caption}</Text>}
              <Text style={{ color: '#888', fontSize: 12 }}>
                {new Date(item.createdAt).toLocaleString()}
              </Text>
              {item.type === 'IMAGE' && (
                <Pressable onPress={() => onExtractStats(item)}>
                  <Text style={styles.extractLink}>Extract Stats</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginRight: 8,
  },
  chipActive: { backgroundColor: '#111', borderColor: '#111' },
  chipText: { color: '#111' },
  chipTextActive: { color: '#fff' },
  postRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: '#f1f1f1',
  },
  videoThumb: { alignItems: 'center', justifyContent: 'center' },
  extractLink: { color: '#2563eb', fontSize: 13, marginTop: 4, fontWeight: '600' },
});
