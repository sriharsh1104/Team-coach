import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { registerBackInterceptor } from '../../navigation/backInterceptors';
import { AppIcon } from '../../ui/AppIcon';
import * as chatApi from '../../api/chat';
import * as voiceApi from '../../api/voice';
import { CacheKeys, hasFreshEnough, revalidate } from '../../api/queryCache';
import { ChatChannel, ChatTeammate, UserPresence } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { getToken } from '../../storage/tokenStorage';
import { useTheme } from '../../theme/ThemeContext';
import { SoftPressable } from '../../ui/SoftPressable';
import { SkeletonList } from '../../ui/Skeleton';
import { FadeIn } from '../../ui/FadeIn';
import { ListSearchField } from '../../ui/ListSearchField';
import {
  matchesPersonQuery,
  usePagedSearch,
} from '../../ui/usePagedSearch';
import { ChatScreen } from './ChatScreen';
import { ChatMediaModal } from './ChatMediaModal';
import { ChatMembersPanel } from './ChatMembersPanel';
import { ChatMemberProfilePanel } from './ChatMemberProfilePanel';
import { subscribeOpenChat } from '../../notifications/openChatChannel';
import { ChatSettingsSheet } from './ChatSettingsSheet';
import { ChatFlowHeader } from './ChatFlowHeader';
import { ChannelAvatar } from './ChannelAvatar';
import { VoiceJoinHeaderButton } from './VoiceJoinHeaderButton';

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

type PersonRow =
  | { key: string; kind: 'dm'; channel: ChatChannel }
  | { key: string; kind: 'start'; mate: ChatTeammate };

type InboxRow =
  | { key: string; kind: 'section'; label: string; soft?: boolean }
  | { key: string; kind: 'group'; channel: ChatChannel }
  | PersonRow
  | { key: string; kind: 'skeleton' }
  | { key: string; kind: 'empty' }
  | { key: string; kind: 'loadMore' };

/** Local steps on top of an open chat — back pops in reverse order. */
type ChatOverlay =
  | { kind: 'media' }
  | { kind: 'members' }
  | { kind: 'profile'; userId: string; name: string };

/**
 * Inbox + conversation: Team Chat (group) separate from 1:1 DMs.
 */
export function ChatHubScreen({ onLoadError }: Props) {
  // Optional (no throw outside a navigator) — used for the voice shortcut.
  const navigation = useContext(NavigationContext);
  const { user } = useAuth();
  const canDirectVoice = !!user?.canDirectVoice;
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
  const [isLoadingInbox, setIsLoadingInbox] = useState(true);
  const [peerOnline, setPeerOnline] = useState(false);
  /** Live green-dot map for DM / teammate rows in the inbox. */
  const [onlineByUserId, setOnlineByUserId] = useState<Record<string, boolean>>(
    {},
  );
  /** Peer ids this user can 1-on-1 call (same guild + both granted). */
  const [directVoicePeerIds, setDirectVoicePeerIds] = useState<Set<string>>(
    () => new Set(),
  );

  const load = useCallback(async (opts?: { force?: boolean }) => {
    await revalidate(
      CacheKeys.chatInbox(),
      () => chatApi.getChatChannels(),
      (data) => {
        setChannels(data.channels);
        setTeammates(data.teammates);
        setIsLoadingInbox(false);
      },
      opts,
    );
  }, []);

  useEffect(() => {
    // Returning to the inbox from a conversation shouldn't blank it out —
    // a cached list paints first and the refetch swaps in behind it.
    setIsLoadingInbox(!hasFreshEnough(CacheKeys.chatInbox()));
    load()
      .catch((err) => onLoadError?.(err))
      .finally(() => setIsLoadingInbox(false));
  }, [load, onLoadError]);

  // Live unread badges / previews: refetch the inbox when the shared chat
  // socket reports activity. Debounced so a burst of messages = one fetch.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = chatApi.subscribeChatInbox(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        load({ force: true }).catch(() => undefined);
      }, 400);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  // Who we can place a 1-on-1 call to — drives the DM header headset.
  // Re-runs when canDirectVoice flips live (SSE / foreground refresh).
  useEffect(() => {
    if (!canDirectVoice) {
      setDirectVoicePeerIds(new Set());
      return;
    }
    let cancelled = false;
    void voiceApi
      .getDirectVoicePeers()
      .then((res) => {
        if (cancelled) return;
        setDirectVoicePeerIds(
          new Set(res.enabled ? res.peers.map((p) => p.id) : []),
        );
      })
      .catch(() => {
        if (!cancelled) setDirectVoicePeerIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [canDirectVoice]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await load({ force: true }).catch((err) => onLoadError?.(err));
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

  const teammateById = useMemo(() => {
    const map = new Map<string, ChatTeammate>();
    for (const t of teammates) map.set(t.userId, t);
    return map;
  }, [teammates]);

  const peopleRows = useMemo((): PersonRow[] => {
    const rows: PersonRow[] = [];
    for (const ch of dmChannels) {
      rows.push({ key: `d:${ch.channelKey}`, kind: 'dm', channel: ch });
    }
    for (const mate of startDmTeammates) {
      rows.push({ key: `s:${mate.userId}`, kind: 'start', mate });
    }
    return rows;
  }, [dmChannels, startDmTeammates]);

  const matchPerson = useCallback(
    (row: PersonRow, q: string) => {
      if (row.kind === 'start') {
        return matchesPersonQuery(q, {
          name: row.mate.name,
          email: row.mate.email,
          inGameName: row.mate.inGameName,
        });
      }
      const mate = row.channel.peerUserId
        ? teammateById.get(row.channel.peerUserId)
        : undefined;
      return matchesPersonQuery(q, {
        name: row.channel.title,
        email: mate?.email,
        inGameName: mate?.inGameName,
      });
    },
    [teammateById],
  );

  const {
    draft: peopleDraft,
    setDraft: setPeopleDraft,
    query: peopleQuery,
    visible: visiblePeople,
    hasMore: peopleHasMore,
    loadMore: loadMorePeople,
    total: peopleTotal,
  } = usePagedSearch({ items: peopleRows, match: matchPerson });

  // Batch-fetch online status for everyone visible in the inbox, and keep
  // the green dots live via presence:update.
  useEffect(() => {
    const ids = [
      ...new Set(
        [
          ...dmChannels.map((c) => c.peerUserId),
          ...startDmTeammates.map((t) => t.userId),
        ].filter((id): id is string => !!id),
      ),
    ];
    if (ids.length === 0) return;

    let cancelled = false;
    let detachUpdate: (() => void) | null = null;
    let detachConnect: (() => void) | null = null;

    void getToken().then((token) => {
      if (!token || cancelled) return;
      const socket = chatApi.connectChatSocket(token);
      const fetchPresence = () => {
        socket.emit(
          'presence:get',
          { userIds: ids },
          (ack: {
            ok?: boolean;
            presence?: Record<string, UserPresence>;
          }) => {
            if (cancelled || !ack?.ok || !ack.presence) return;
            setOnlineByUserId((prev) => {
              const next = { ...prev };
              for (const [id, p] of Object.entries(ack.presence!)) {
                next[id] = !!p.online;
              }
              return next;
            });
          },
        );
      };
      if (socket.connected) fetchPresence();
      else {
        const onConnect = () => fetchPresence();
        socket.once('connect', onConnect);
        detachConnect = () => socket.off('connect', onConnect);
      }
      const onUpdate = (payload: {
        userId: string;
        online: boolean;
      }) => {
        setOnlineByUserId((prev) => ({
          ...prev,
          [payload.userId]: !!payload.online,
        }));
      };
      socket.on('presence:update', onUpdate);
      detachUpdate = () => socket.off('presence:update', onUpdate);
    });

    return () => {
      cancelled = true;
      detachConnect?.();
      detachUpdate?.();
    };
  }, [dmChannels, startDmTeammates]);

  const pushOverlay = (overlay: ChatOverlay) => {
    setOverlayStack((prev) => [...prev, overlay]);
  };

  const popOverlay = () => {
    setOverlayStack((prev) => prev.slice(0, -1));
  };

  const openChannel = useCallback((channel: {
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
    setPeerOnline(false);
    setActive({
      channelKey: channel.channelKey,
      title: channel.title,
      type: channel.type,
      memberCount: channel.memberCount ?? null,
      peerUserId: channel.peerUserId ?? null,
      muted: !!channel.muted,
      avatarUrl: channel.peerAvatarUrl ?? channel.avatarUrl ?? null,
    });
  }, []);

  // Notification tap → open that exact thread (DM / team / guild).
  useEffect(() => {
    return subscribeOpenChat((req) => {
      const apply = (channelRows: ChatChannel[], mateRows: ChatTeammate[]) => {
        const existing = channelRows.find((c) => c.channelKey === req.channelKey);
        if (existing) {
          openChannel(existing);
          return;
        }
        const mate = mateRows.find((t) => t.channelKey === req.channelKey);
        if (mate) {
          openChannel({
            channelKey: mate.channelKey,
            title: mate.name,
            type: 'DM',
            peerUserId: mate.userId,
            peerAvatarUrl: mate.avatarUrl,
          });
          return;
        }
        const isDm = req.channelKey.startsWith('dm:');
        openChannel({
          channelKey: req.channelKey,
          title:
            req.title ||
            (req.channelKey === 'guild'
              ? 'Guild Chat'
              : req.channelKey === 'org'
                ? 'Team Chat'
                : 'Chat'),
          type: isDm ? 'DM' : 'ORG',
          peerUserId: req.senderId ?? null,
        });
      };

      if (channels.length > 0 || teammates.length > 0) {
        apply(channels, teammates);
        return;
      }
      void chatApi
        .getChatChannels()
        .then((data) => {
          setChannels(data.channels);
          setTeammates(data.teammates);
          apply(data.channels, data.teammates);
        })
        .catch(() => apply([], []));
    });
  }, [channels, teammates, openChannel]);

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
    setPeerOnline(false);
    setActive(null);
    // The inbox was loaded once on mount — without this, returning from a
    // conversation you just sent a message in still shows the stale
    // "No messages yet" preview until a manual pull-to-refresh.
    load({ force: true }).catch((err) => onLoadError?.(err));
  };

  // Android back inside the chat hub: peel off overlays, then the open
  // conversation, before the host screen's exit prompt ever sees the press.
  useEffect(() => {
    return registerBackInterceptor(() => {
      if (overlayStack.length > 0) {
        popOverlay();
        return true;
      }
      if (settingsOpen) {
        setSettingsOpen(false);
        return true;
      }
      if (searchOpen) {
        setSearchOpen(false);
        return true;
      }
      if (active) {
        backToInbox();
        return true;
      }
      if (starredOnly) {
        setStarredOnly(false);
        return true;
      }
      return false;
    });
    // backToInbox / popOverlay are re-created each render; the deps that
    // matter are the flags the interceptor reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayStack.length, settingsOpen, searchOpen, active, starredOnly]);

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

  const inboxRows = useMemo((): InboxRow[] => {
    const rows: InboxRow[] = [];
    const showGroups =
      !peopleQuery ||
      groupChannels.some((c) => c.title.toLowerCase().includes(peopleQuery));
    if (showGroups && groupChannels.length > 0) {
      rows.push({ key: 'sec-group', kind: 'section', label: 'Group Chats' });
      for (const ch of groupChannels) {
        if (
          peopleQuery &&
          !ch.title.toLowerCase().includes(peopleQuery)
        ) {
          continue;
        }
        rows.push({ key: `g:${ch.channelKey}`, kind: 'group', channel: ch });
      }
    }

    const visibleDms = visiblePeople.filter((r) => r.kind === 'dm');
    const visibleStarts = visiblePeople.filter((r) => r.kind === 'start');
    if (visibleDms.length > 0 || visibleStarts.length > 0 || peopleQuery) {
      rows.push({ key: 'sec-dm', kind: 'section', label: 'Direct Messages' });
    }
    for (const row of visibleDms) rows.push(row);
    if (visibleStarts.length > 0) {
      if (visibleDms.length > 0 || !peopleQuery) {
        rows.push({
          key: 'sec-start',
          kind: 'section',
          label: 'Start new',
          soft: true,
        });
      }
      for (const row of visibleStarts) rows.push(row);
    }
    if (peopleHasMore) {
      rows.push({ key: 'loadMore', kind: 'loadMore' });
    }
    if (isLoadingInbox) {
      rows.push({ key: 'skeleton', kind: 'skeleton' });
    } else if (teammates.length === 0) {
      rows.push({ key: 'empty', kind: 'empty' });
    } else if (peopleQuery && peopleTotal === 0 && !showGroups) {
      rows.push({ key: 'empty', kind: 'empty' });
    }
    return rows;
  }, [
    groupChannels,
    visiblePeople,
    peopleHasMore,
    peopleQuery,
    peopleTotal,
    isLoadingInbox,
    teammates.length,
  ]);

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
          channelKey={active.channelKey}
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
        : peerOnline
          ? 'Tap for profile'
          : 'Direct message · Tap for profile';

    return (
      <FadeIn
        animKey={active.channelKey}
        duration={120}
        style={[styles.flex, { backgroundColor: theme.bg }]}
      >
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
              online={active.type === 'DM' && peerOnline}
            />
          }
          trailing={
            <>
              {active.channelKey === 'org' || active.channelKey === 'guild' ? (
                <VoiceJoinHeaderButton
                  room={active.channelKey === 'guild' ? 'guild' : 'team'}
                  onPress={() =>
                    (navigation as any)?.navigate(
                      active.channelKey === 'guild' ? 'GuildVoice' : 'Voice',
                    )
                  }
                />
              ) : null}
              {active.type === 'DM' &&
              active.peerUserId &&
              directVoicePeerIds.has(active.peerUserId) ? (
                <VoiceJoinHeaderButton
                  room="direct"
                  peerId={active.peerUserId}
                  onPress={() =>
                    (navigation as any)?.navigate('DirectVoice', {
                      peerId: active.peerUserId,
                      peerName: active.title,
                      peerAvatarUrl: active.avatarUrl,
                    })
                  }
                />
              ) : null}
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
          onPeerPresenceChange={(p: UserPresence | null) =>
            setPeerOnline(!!p?.online)
          }
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
          muted={!!active.muted}
          onClose={() => setSettingsOpen(false)}
          onCleared={() => {
            setStarredOnly(false);
            setChatEpoch((n) => n + 1);
          }}
          onStarredFilter={() => {
            setSettingsOpen(false);
            setStarredOnly(true);
          }}
          onSearch={() => setSearchOpen(true)}
          onToggleMute={() => void toggleMute()}
          onOpenMedia={() => pushOverlay({ kind: 'media' })}
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
      </FadeIn>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.bg }]}>
      <Text style={[styles.inboxTitle, { color: theme.text }]}>Chats</Text>
      <View style={{ paddingHorizontal: 16 }}>
        <ListSearchField
          value={peopleDraft}
          onChangeText={setPeopleDraft}
          placeholder="Search by name or email"
          accessibilityLabel="Search chats"
        />
      </View>
      <FlatList
        data={inboxRows}
        keyExtractor={(item) => item.key}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        onEndReached={() => {
          if (peopleHasMore) loadMorePeople();
        }}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={theme.chrome}
          />
        }
        renderItem={({ item }) => {
          if (item.kind === 'section') {
            return (
              <Text
                style={[
                  item.soft ? styles.sectionSoft : styles.section,
                  { color: item.soft ? theme.textDim : theme.textMuted },
                ]}
              >
                {item.label}
              </Text>
            );
          }
          if (item.kind === 'loadMore') {
            return (
              <SoftPressable
                style={{ paddingVertical: 14, alignItems: 'center' }}
                onPress={loadMorePeople}
                pressScale={0.98}
                accessibilityRole="button"
                accessibilityLabel="Load more"
              >
                <Text style={{ color: theme.link, fontWeight: '700' }}>
                  Load more
                </Text>
              </SoftPressable>
            );
          }
          if (item.kind === 'skeleton') {
            return (
              <SkeletonList
                count={6}
                avatarSize={40}
                style={{ paddingHorizontal: 26 }}
              />
            );
          }
          if (item.kind === 'empty') {
            return (
              <Text style={[styles.empty, { color: theme.textMuted }]}>
                {peopleQuery ? 'No matches.' : 'No teammates yet.'}
              </Text>
            );
          }
          if (item.kind === 'group') {
            const ch = item.channel;
            return (
              <View
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
                  haptic={false}
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
            );
          }
          if (item.kind === 'dm') {
            const channel = item.channel;
            return (
              <SoftPressable
                style={[
                  styles.row,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
                onPress={() =>
                  openChannel({
                    ...channel,
                    peerUserId: channel.peerUserId,
                  })
                }
                pressScale={0.985}
                haptic={false}
              >
                <ChannelAvatar
                  uri={channel.peerAvatarUrl}
                  size={40}
                  fallback={(channel.title || '?').slice(0, 1).toUpperCase()}
                  previewable={!!channel.peerAvatarUrl}
                  online={
                    !!channel.peerUserId &&
                    !!onlineByUserId[channel.peerUserId]
                  }
                />
                <View style={styles.rowMain}>
                  <Text style={[styles.rowTitle, { color: theme.text }]}>
                    {channel.title}
                  </Text>
                  {channel.lastPreview ? (
                    <Text
                      style={[styles.preview, { color: theme.textMuted }]}
                      numberOfLines={1}
                    >
                      {channel.lastPreview}
                    </Text>
                  ) : (
                    <Text style={[styles.preview, { color: theme.textMuted }]}>
                      No messages yet
                    </Text>
                  )}
                </View>
                {channel.unreadCount > 0 ? (
                  <View style={[styles.badge, { backgroundColor: theme.chrome }]}>
                    <Text style={[styles.badgeText, { color: theme.chromeInk }]}>
                      {channel.unreadCount}
                    </Text>
                  </View>
                ) : null}
              </SoftPressable>
            );
          }
          const mate = item.mate;
          return (
            <SoftPressable
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
              haptic={false}
            >
              <ChannelAvatar
                uri={mate.avatarUrl}
                size={40}
                fallback={(mate.name || '?').slice(0, 1).toUpperCase()}
                previewable={!!mate.avatarUrl}
                online={!!onlineByUserId[mate.userId]}
              />
              <Text style={[styles.rowTitle, { color: theme.text }]}>
                {mate.name}
              </Text>
            </SoftPressable>
          );
        }}
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
  empty: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  iconBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
