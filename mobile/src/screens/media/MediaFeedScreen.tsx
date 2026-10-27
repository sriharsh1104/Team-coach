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
import { Screen } from '../../brand/Screen';
import { ButtonLabel } from '../../ui/ButtonLabel';
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
    <Screen>
    <View style={sharedStyles.container}>
      <Text style={sharedStyles.title}>Media</Text>

      <Pressable
        style={sharedStyles.button}
        onPress={() => navigation.navigate('UploadMedia')}
      >
        <ButtonLabel icon="upload">Upload Screenshot / Clip</ButtonLabel>
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
          <Text style={{ textAlign: 'center', color: '#9aa0a6', marginTop: 24 }}>
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
              <Text style={{ fontWeight: '600', color: '#f2f3f5' }}>{item.uploaderName}</Text>
              {item.caption && (
                <Text numberOfLines={2} style={{ color: '#e8eaed' }}>
                  {item.caption}
                </Text>
              )}
              <Text style={{ color: '#9aa0a6', fontSize: 12 }}>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderColor: '#5f6368',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginRight: 8,
  },
  chipActive: { backgroundColor: '#c9ccd1', borderColor: '#c9ccd1' },
  chipText: { color: '#f2f3f5' },
  chipTextActive: { color: '#0a0a0c' },
  postRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3d44',
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  videoThumb: { alignItems: 'center', justifyContent: 'center' },
  extractLink: { color: '#a8b0ff', fontSize: 13, marginTop: 4, fontWeight: '600' },
});
