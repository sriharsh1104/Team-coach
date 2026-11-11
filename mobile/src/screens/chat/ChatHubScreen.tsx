import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { AppIcon } from '../../ui/AppIcon';
import * as chatApi from '../../api/chat';
import { ChatChannel, ChatTeammate } from '../../api/types';
import { useTheme } from '../../theme/ThemeContext';
import { SoftPressable } from '../../ui/SoftPressable';
import { ChatScreen } from './ChatScreen';
import { ChatMediaModal } from './ChatMediaModal';
import { ChatMembersPanel } from './ChatMembersPanel';
import { ChatMemberProfilePanel } from './ChatMemberProfilePanel';
import { ChatSettingsSheet } from './ChatSettingsSheet';
import { ChatFlowHeader } from './ChatFlowHeader';
import { ChannelAvatar } from './ChannelAvatar';

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
  peerUserId: string | null;
  muted: boolean;
  avatarUrl: string | null;
};

/** Local steps on top of an open chat — back pops in reverse order. */
type ChatOverlay =
  | { kind: 'media' }
  | { kind: 'members' }
  | { kind: 'profile'; userId: string; name: string };

/**
 * Inbox + conversation: Team Chat (group) separate from 1:1 DMs.
 */
export function ChatHubScreen({ onLoadError }: Props) {
  const { colors: theme } = useTheme();
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [teammates, setTeammates] = useState<ChatTeammate[]>([]);
  const [active, setActive] = useState<ActiveChat | null>(null);
  const [overlayStack, setOverlayStack] = useState<ChatOverlay[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [starredOnly, setStarredOnly] = useState(false);
  const [chatEpoch, setChatEpoch] = useState(0);
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

  // Every group channel the user has (Team Chat and/or Guild Chat) — a
  // roster member who's also a guild member sees both, not just whichever
  // came first, so there's no longer a separate "Guild Chat" destination.
  const groupChannels = useMemo(
    () => channels.filter((c) => c.type === 'ORG'),
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

  const pushOverlay = (overlay: ChatOverlay) => {
    setOverlayStack((prev) => [...prev, overlay]);
  };

  const popOverlay = () => {
    setOverlayStack((prev) => prev.slice(0, -1));
  };

  const openChannel = (channel: {
    channelKey: string;
    title: string;
    type: 'ORG' | 'DM';
    memberCount?: number | null;
    peerUserId?: string | null;
    muted?: boolean;
    peerAvatarUrl?: string | null;
    avatarUrl?: string | null;
  }) => {
    setOverlayStack([]);
    setActive({
      channelKey: channel.channelKey,
      title: channel.title,
      type: channel.type,
      memberCount: channel.memberCount ?? null,
      peerUserId: channel.peerUserId ?? null,
      muted: !!channel.muted,
      avatarUrl: channel.peerAvatarUrl ?? channel.avatarUrl ?? null,
    });
  };

  const toggleMute = async () => {
    if (!active) return;
    const next = !active.muted;
    setActive({ ...active, muted: next });
    setChannels((prev) =>
      prev.map((c) =>
        c.channelKey === active.channelKey ? { ...c, muted: next } : c,
      ),
    );
    try {
      await chatApi.setChannelMuted(active.channelKey, next);
    } catch {
      setActive({ ...active, muted: !next });
      setChannels((prev) =>
        prev.map((c) =>
          c.channelKey === active.channelKey ? { ...c, muted: !next } : c,
        ),
      );
    }
  };

  const backToInbox = () => {
    setOverlayStack([]);
    setSearchOpen(false);
    setSettingsOpen(false);
    setStarredOnly(false);
    setActive(null);
    // The inbox was loaded once on mount — without this, returning from a
    // conversation you just sent a message in still shows the stale
    // "No messages yet" preview until a manual pull-to-refresh.
    load().catch((err) => onLoadError?.(err));
  };

  const openHeaderInfo = () => {
    if (!active) return;
    if (active.type === 'ORG') {
      pushOverlay({ kind: 'members' });
      return;
    }
    if (active.peerUserId) {
      pushOverlay({
        kind: 'profile',
        userId: active.peerUserId,
        name: active.title,
      });
    }
  };

  if (active) {
    const top = overlayStack[overlayStack.length - 1] ?? null;
    const mediaOpen = top?.kind === 'media';

    if (top?.kind === 'profile') {
      return (
        <ChatMemberProfilePanel
          userId={top.userId}
          name={top.name}
          onBack={popOverlay}
        />
      );
    }

    if (top?.kind === 'members') {
      return (
        <ChatMembersPanel
          title={active.title}
          onBack={popOverlay}
          onSelectMember={(member) =>
            pushOverlay({
              kind: 'profile',
              userId: member.userId,
              name: member.name,
            })
          }
        />
      );
    }

    const subtitle =
      active.type === 'ORG'
        ? active.memberCount
          ? `${active.memberCount} member${active.memberCount === 1 ? '' : 's'} · Tap for list`
          : 'Group chat · Tap for members'
        : 'Direct message · Tap for profile';

    return (
      <View style={[styles.flex, { backgroundColor: theme.bg }]}>
        <ChatFlowHeader
          title={active.title}
          subtitle={subtitle}
          onBack={backToInbox}
          onTitlePress={openHeaderInfo}
          titleAccessibilityLabel={
            active.type === 'ORG' ? 'Team members' : 'Member profile'
          }
          leading={
            <ChannelAvatar
              uri={active.avatarUrl}
              size={34}
              fallback={active.type === 'ORG' ? '◈' : active.title.slice(0, 1)}
            />
          }
          trailing={
            <>
              <SoftPressable
                style={styles.mediaBtn}
                onPress={() => pushOverlay({ kind: 'media' })}
                accessibilityRole="button"
                accessibilityLabel="Chat Media"
                hitSlop={8}
                pressScale={0.95}
              >
                <Text style={[styles.mediaBtnText, { color: theme.icon }]}>
                  Media
                </Text>
              </SoftPressable>

              <SoftPressable
                style={styles.iconBtn}
                onPress={() => void toggleMute()}
                accessibilityRole="button"
                accessibilityLabel={active.muted ? 'Unmute chat' : 'Mute chat'}
                hitSlop={10}
                pressScale={0.92}
              >
                <AppIcon
                  name={active.muted ? 'notifications-off' : 'notifications'}
                  size={22}
                  color={active.muted ? theme.textMuted : theme.icon}
                />
              </SoftPressable>

              <SoftPressable
                style={styles.iconBtn}
                onPress={() => setSearchOpen((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel="Search chat"
                hitSlop={10}
                pressScale={0.92}
              >
                <AppIcon name="search" size={22} color={theme.icon} />
              </SoftPressable>

              <SoftPressable
                style={styles.iconBtn}
                onPress={() => setSettingsOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Chat settings"
                hitSlop={10}
                pressScale={0.92}
              >
                <AppIcon name="ellipsis-vertical" size={20} color={theme.icon} />
              </SoftPressable>
            </>
          }
        />
        {starredOnly ? (
          <View
            style={[
              styles.starredBanner,
              {
                backgroundColor: theme.surface,
                borderBottomColor: theme.border,
              },
            ]}
          >
            <Text style={[styles.starredBannerText, { color: theme.text }]}>
              Starred messages
            </Text>
            <SoftPressable
              onPress={() => setStarredOnly(false)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Show all messages"
              pressScale={0.95}
            >
              <Text style={[styles.starredBannerAction, { color: theme.link }]}>
                Show all
              </Text>
            </SoftPressable>
          </View>
        ) : null}
        <ChatScreen
          key={`${active.channelKey}:${starredOnly ? 'starred' : 'all'}:${chatEpoch}`}
          embedded
          channelKey={active.channelKey}
          searchActive={searchOpen}
          onCloseSearch={() => setSearchOpen(false)}
          starredOnly={starredOnly}
        />
        <ChatMediaModal
          visible={mediaOpen}
          channelKey={active.channelKey}
          title={active.title}
          onClose={popOverlay}
        />
        <ChatSettingsSheet
          visible={settingsOpen}
          channelKey={active.channelKey}
          isGroup={active.type === 'ORG'}
          onClose={() => setSettingsOpen(false)}
          onCleared={() => {
            setStarredOnly(false);
            setChatEpoch((n) => n + 1);
          }}
          onStarredFilter={() => {
            setSettingsOpen(false);
            setStarredOnly(true);
          }}
          onMetaChanged={(meta) => {
            setActive((prev) =>
              prev ? { ...prev, avatarUrl: meta.avatarUrl } : prev,
            );
            setChannels((prev) =>
              prev.map((c) =>
                c.channelKey === meta.channelKey
                  ? { ...c, peerAvatarUrl: meta.avatarUrl }
                  : c,
              ),
            );
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.bg }]}>
      <Text style={[styles.inboxTitle, { color: theme.text }]}>Chats</Text>
      <FlatList
        data={[{ key: 'inbox' }]}
        keyExtractor={(item) => item.key}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={theme.chrome}
          />
        }
        renderItem={() => (
          <View>
            {groupChannels.length > 0 ? (
              <Text style={[styles.section, { color: theme.textMuted }]}>
                Group Chats
              </Text>
            ) : null}
            {groupChannels.map((ch) => (
              <View
                key={ch.channelKey}
                style={[
                  styles.row,
                  styles.teamRow,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
              >
                <ChannelAvatar uri={ch.peerAvatarUrl} size={40} />
                <SoftPressable
                  style={styles.rowMain}
                  onPress={() => openChannel(ch)}
                  pressScale={0.985}
                  accessibilityRole="button"
                  accessibilityLabel={ch.title}
                >
                  <Text style={[styles.rowTitle, { color: theme.text }]}>
                    {ch.title}
                  </Text>
                  <Text
                    style={[styles.preview, { color: theme.textMuted }]}
                    numberOfLines={1}
                  >
                    {ch.memberCount ? `${ch.memberCount} members` : 'Group'}
                    {ch.lastPreview
                      ? ` · ${ch.lastPreview}`
                      : ' · No messages yet'}
                  </Text>
                </SoftPressable>
                {ch.unreadCount > 0 ? (
                  <View style={[styles.badge, { backgroundColor: theme.chrome }]}>
                    <Text style={[styles.badgeText, { color: theme.chromeInk }]}>
                      {ch.unreadCount}
                    </Text>
                  </View>
                ) : null}
              </View>
            ))}

            {(dmChannels.length > 0 || startDmTeammates.length > 0) && (
              <Text style={[styles.section, { color: theme.textMuted }]}>
                Direct Messages
              </Text>
            )}

            {dmChannels.map((item) => (
              <SoftPressable
                key={item.channelKey}
                style={[
                  styles.row,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
                onPress={() =>
                  openChannel({
                    ...item,
                    peerUserId: item.peerUserId,
                  })
                }
                pressScale={0.985}
              >
                <ChannelAvatar
                  uri={item.peerAvatarUrl}
                  size={40}
                  fallback={(item.title || '?').slice(0, 1).toUpperCase()}
                  previewable={!!item.peerAvatarUrl}
                />
                <View style={styles.rowMain}>
                  <Text style={[styles.rowTitle, { color: theme.text }]}>
                    {item.title}
                  </Text>
                  {item.lastPreview ? (
                    <Text
                      style={[styles.preview, { color: theme.textMuted }]}
                      numberOfLines={1}
                    >
                      {item.lastPreview}
                    </Text>
                  ) : (
                    <Text style={[styles.preview, { color: theme.textMuted }]}>
                      No messages yet
                    </Text>
                  )}
                </View>
                <Text style={[styles.dmHint, { color: theme.textMuted }]}>
                  1:1
                </Text>
                {item.unreadCount > 0 ? (
                  <View style={[styles.badge, { backgroundColor: theme.chrome }]}>
                    <Text style={[styles.badgeText, { color: theme.chromeInk }]}>
                      {item.unreadCount}
                    </Text>
                  </View>
                ) : null}
              </SoftPressable>
            ))}

            {startDmTeammates.length > 0 && (
              <>
                {dmChannels.length > 0 ? (
                  <Text style={[styles.sectionSoft, { color: theme.textDim }]}>
                    Start new
                  </Text>
                ) : null}
                {startDmTeammates.map((mate) => (
                  <SoftPressable
                    key={mate.userId}
                    style={[
                      styles.row,
                      {
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                      },
                    ]}
                    onPress={() =>
                      openChannel({
                        channelKey: mate.channelKey,
                        title: mate.name,
                        type: 'DM',
                        memberCount: null,
                        peerUserId: mate.userId,
                        avatarUrl: mate.avatarUrl,
                      })
                    }
                    pressScale={0.985}
                  >
                    <ChannelAvatar
                      uri={mate.avatarUrl}
                      size={40}
                      fallback={(mate.name || '?').slice(0, 1).toUpperCase()}
                      previewable={!!mate.avatarUrl}
                    />
                    <Text style={[styles.rowTitle, { color: theme.text }]}>
                      {mate.name}
                    </Text>
                    <Text style={[styles.dmHint, { color: theme.textMuted }]}>
                      1:1
                    </Text>
                  </SoftPressable>
                ))}
              </>
            )}

            {teammates.length === 0 ? (
              <Text style={[styles.empty, { color: theme.textMuted }]}>
                No teammates yet.
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  starredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  starredBannerText: {
    fontWeight: '700',
    fontSize: 13,
  },
  starredBannerAction: {
    fontWeight: '700',
    fontSize: 13,
  },
  inboxTitle: {
    fontSize: 22,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
    letterSpacing: -0.3,
  },
  section: {
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
  },
  sectionSoft: {
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
    borderWidth: 1,
  },
  teamRow: {},
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { fontWeight: '700', fontSize: 16 },
  preview: { marginTop: 2, fontSize: 13 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { fontWeight: '700', fontSize: 12 },
  dmHint: { fontSize: 12, fontWeight: '600' },
  empty: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  mediaBtn: {
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  mediaBtnText: {
    fontWeight: '700',
    fontSize: 14,
  },
  iconBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
