import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import * as chatApi from '../../api/chat';
import { ChatChannel, ChatTeammate } from '../../api/types';
import { colors } from '../../theme';
import { ChatScreen } from './ChatScreen';

interface Props {
  /** Called when loading the channel list fails — e.g. to surface a toast.
   * Without this, a load failure used to fail completely silently. */
  onLoadError?: (error: unknown) => void;
}

/**
 * Inbox + conversation: Team Chat + 1:1 DMs.
 * Default selection is the org group channel.
 */
export function ChatHubScreen({ onLoadError }: Props) {
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [teammates, setTeammates] = useState<ChatTeammate[]>([]);
  const [activeKey, setActiveKey] = useState('org');
  const [activeTitle, setActiveTitle] = useState('Team Chat');
  const [showInbox, setShowInbox] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await chatApi.getChatChannels();
    setChannels(data.channels);
    setTeammates(data.teammates);
  }, []);

  useEffect(() => {
    load().catch((err) => onLoadError?.(err));
  }, [load, onLoadError]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await load().catch((err) => onLoadError?.(err));
    setIsRefreshing(false);
  };

  const openChannel = (channelKey: string, title: string) => {
    setActiveKey(channelKey);
    setActiveTitle(title);
    setShowInbox(false);
  };

  const backToInbox = () => {
    setShowInbox(true);
    // The inbox was loaded once on mount — without this, returning from a
    // conversation you just sent a message in still shows the stale
    // "No messages yet" preview until a manual pull-to-refresh.
    load().catch((err) => onLoadError?.(err));
  };

  if (!showInbox) {
    return (
      <View style={styles.flex}>
        <View style={styles.chatHeader}>
          <Pressable onPress={backToInbox} hitSlop={8}>
            <Text style={styles.back}>← Chats</Text>
          </Pressable>
          <Text style={styles.chatTitle} numberOfLines={1}>
            {activeTitle}
          </Text>
        </View>
        <ChatScreen key={activeKey} embedded channelKey={activeKey} />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <Text style={styles.inboxTitle}>Chats</Text>
      <FlatList
        data={channels}
        keyExtractor={(item) => item.channelKey}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.chrome}
          />
        }
        ListHeaderComponent={
          <View>
            <Text style={styles.section}>Team</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => openChannel(item.channelKey, item.title)}
          >
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              {item.lastPreview ? (
                <Text style={styles.preview} numberOfLines={1}>
                  {item.lastPreview}
                </Text>
              ) : (
                <Text style={styles.preview}>No messages yet</Text>
              )}
            </View>
            {item.unreadCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.unreadCount}</Text>
              </View>
            ) : null}
          </Pressable>
        )}
        ListFooterComponent={
          <View style={styles.newDmBlock}>
            <Text style={styles.section}>Start Direct Message</Text>
            {teammates.map((mate) => (
              <Pressable
                key={mate.userId}
                style={styles.row}
                onPress={() => openChannel(mate.channelKey, mate.name)}
              >
                <Text style={styles.rowTitle}>{mate.name}</Text>
                <Text style={styles.dmHint}>1:1</Text>
              </Pressable>
            ))}
            {teammates.length === 0 ? (
              <Text style={styles.empty}>No teammates yet.</Text>
            ) : null}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  inboxTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  section: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 10,
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.text, fontWeight: '700', fontSize: 16 },
  preview: { color: colors.textMuted, marginTop: 2, fontSize: 13 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.link,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: '#0a0a0c', fontWeight: '700', fontSize: 12 },
  newDmBlock: { paddingBottom: 24 },
  dmHint: { color: colors.textMuted, fontSize: 12 },
  empty: {
    color: colors.textMuted,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  back: { color: colors.link, fontWeight: '600' },
  chatTitle: { flex: 1, color: colors.text, fontWeight: '700', fontSize: 16 },
});
