import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import * as chatApi from '../../api/chat';
import { ChatChannel, ChatTeammate } from '../../api/types';
import { colors } from '../../theme';
import { SoftPressable } from '../../ui/SoftPressable';
import { ChatScreen } from './ChatScreen';
import { ChatMediaModal } from './ChatMediaModal';

interface Props {
  /** Called when loading the channel list fails — e.g. to surface a toast.
   * Without this, a load failure used to fail completely silently. */
  onLoadError?: (error: unknown) => void;
}

type ActiveChat = {
  channelKey: string;
  title: string;
  type: 'ORG' | 'DM';
  memberCount: number | null;
};

/**
 * Inbox + conversation: Team Chat (group) separate from 1:1 DMs.
 */
export function ChatHubScreen({ onLoadError }: Props) {
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [teammates, setTeammates] = useState<ChatTeammate[]>([]);
  const [active, setActive] = useState<ActiveChat | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mediaGalleryOpen, setMediaGalleryOpen] = useState(false);

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

  const teamChannel = useMemo(
    () => channels.find((c) => c.type === 'ORG') ?? null,
    [channels],
  );
  const dmChannels = useMemo(
    () => channels.filter((c) => c.type === 'DM'),
    [channels],
  );
  // Teammates who don't already have an active DM row under Direct Messages.
  const startDmTeammates = useMemo(() => {
    const openKeys = new Set(dmChannels.map((d) => d.channelKey));
    return teammates.filter((t) => !openKeys.has(t.channelKey));
  }, [teammates, dmChannels]);

  const openChannel = (channel: {
    channelKey: string;
    title: string;
    type: 'ORG' | 'DM';
    memberCount?: number | null;
  }) => {
    setActive({
      channelKey: channel.channelKey,
      title: channel.title,
      type: channel.type,
      memberCount: channel.memberCount ?? null,
    });
  };

  const backToInbox = () => {
    setActive(null);
    // The inbox was loaded once on mount — without this, returning from a
    // conversation you just sent a message in still shows the stale
    // "No messages yet" preview until a manual pull-to-refresh.
    load().catch((err) => onLoadError?.(err));
  };

  if (active) {
    const subtitle =
      active.type === 'ORG'
        ? active.memberCount
          ? `${active.memberCount} member${active.memberCount === 1 ? '' : 's'} · Tap for media`
          : 'Group chat · Tap for media'
        : 'Direct message · Tap for media';

    return (
      <View style={styles.flex}>
        <View style={styles.chatHeader}>
          <SoftPressable
            onPress={backToInbox}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="← Chats"
            pressScale={0.94}
          >
            <Text style={styles.backLabel}>← Chats</Text>
          </SoftPressable>

          <SoftPressable
            style={styles.chatTitleBlock}
            onPress={() => setMediaGalleryOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={active.title}
            pressScale={0.98}
          >
            <Text style={styles.chatTitle} numberOfLines={1}>
              {active.title}
            </Text>
            <Text style={styles.chatSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          </SoftPressable>

          <SoftPressable
            style={styles.mediaBtn}
            onPress={() => setMediaGalleryOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Chat Media"
            pressScale={0.95}
          >
            <Text style={styles.mediaBtnText}>Media</Text>
          </SoftPressable>
        </View>
        <ChatScreen key={active.channelKey} embedded channelKey={active.channelKey} />
        <ChatMediaModal
          visible={mediaGalleryOpen}
          channelKey={active.channelKey}
          title={active.title}
          onClose={() => setMediaGalleryOpen(false)}
        />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <Text style={styles.inboxTitle}>Chats</Text>
      <FlatList
        data={[{ key: 'inbox' }]}
        keyExtractor={(item) => item.key}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.chrome}
          />
        }
        renderItem={() => (
          <View>
            <Text style={styles.section}>Team</Text>
            {teamChannel ? (
              <SoftPressable
                style={[styles.row, styles.teamRow]}
                onPress={() => openChannel(teamChannel)}
                pressScale={0.985}
              >
                <View style={styles.teamAvatar}>
                  <Text style={styles.teamAvatarText}>◈</Text>
                </View>
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>{teamChannel.title}</Text>
                  <Text style={styles.preview} numberOfLines={1}>
                    {teamChannel.memberCount
                      ? `${teamChannel.memberCount} members`
                      : 'Group'}
                    {teamChannel.lastPreview
                      ? ` · ${teamChannel.lastPreview}`
                      : ' · No messages yet'}
                  </Text>
                </View>
                {teamChannel.unreadCount > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{teamChannel.unreadCount}</Text>
                  </View>
                ) : null}
              </SoftPressable>
            ) : null}

            {(dmChannels.length > 0 || startDmTeammates.length > 0) && (
              <Text style={styles.section}>Direct Messages</Text>
            )}

            {dmChannels.map((item) => (
              <SoftPressable
                key={item.channelKey}
                style={styles.row}
                onPress={() => openChannel(item)}
                pressScale={0.985}
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
                <Text style={styles.dmHint}>1:1</Text>
                {item.unreadCount > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.unreadCount}</Text>
                  </View>
                ) : null}
              </SoftPressable>
            ))}

            {startDmTeammates.length > 0 && (
              <>
                {dmChannels.length > 0 ? (
                  <Text style={styles.sectionSoft}>Start new</Text>
                ) : null}
                {startDmTeammates.map((mate) => (
                  <SoftPressable
                    key={mate.userId}
                    style={styles.row}
                    onPress={() =>
                      openChannel({
                        channelKey: mate.channelKey,
                        title: mate.name,
                        type: 'DM',
                        memberCount: null,
                      })
                    }
                    pressScale={0.985}
                  >
                    <Text style={styles.rowTitle}>{mate.name}</Text>
                    <Text style={styles.dmHint}>1:1</Text>
                  </SoftPressable>
                ))}
              </>
            )}

            {teammates.length === 0 ? (
              <Text style={styles.empty}>No teammates yet.</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  inboxTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
    letterSpacing: -0.3,
  },
  section: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
  },
  sectionSoft: {
    color: colors.textDim,
    fontWeight: '600',
    fontSize: 12,
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  teamRow: {
    backgroundColor: 'rgba(201,204,209,0.08)',
    borderColor: 'rgba(201,204,209,0.18)',
  },
  teamAvatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(201,204,209,0.18)',
  },
  teamAvatarText: { color: colors.chrome, fontWeight: '700', fontSize: 16 },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.text, fontWeight: '700', fontSize: 16 },
  preview: { color: colors.textMuted, marginTop: 2, fontSize: 13 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.chrome,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: colors.chromeInk, fontWeight: '700', fontSize: 12 },
  dmHint: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  empty: {
    color: colors.textMuted,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(10,10,12,0.92)',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  backLabel: {
    color: colors.link,
    fontWeight: '700',
    fontSize: 13,
  },
  chatTitleBlock: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  chatTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 17,
    textAlign: 'center',
  },
  chatSubtitle: {
    color: colors.textDim,
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  mediaBtn: {
    borderWidth: 1,
    borderColor: colors.chrome,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(201,204,209,0.12)',
  },
  mediaBtnText: {
    color: colors.chrome,
    fontWeight: '700',
    fontSize: 13,
  },
});
