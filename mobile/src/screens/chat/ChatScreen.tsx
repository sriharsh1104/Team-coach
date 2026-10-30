import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Socket } from 'socket.io-client';
import { getToken } from '../../storage/tokenStorage';
import * as chatApi from '../../api/chat';
import { ReadReceipt, DeliveryReceipt } from '../../api/chat';
import { ChatMessage } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Screen } from '../../brand/Screen';
import { sharedStyles, formatRoleBadge } from '../shared';
import { AttachMenu, AttachOption } from './AttachMenu';
import { MediaViewerModal } from './MediaViewerModal';
import { MessageInfoModal } from './MessageInfoModal';
import { colors } from '../../theme';

// "Teammate · Coach" / "Owner Coach · Coach (Owner)" — role badge is shown
// next to the name for everyone but yourself (you already know your own role).
function formatSenderLabel(message: ChatMessage): string {
  const badge = formatRoleBadge(message.senderRole, message.senderIsOwner);
  return badge ? `${message.senderName} · ${badge}` : message.senderName;
}

const SEARCH_DEBOUNCE_MS = 300;

export function ChatScreen({
  embedded = false,
  channelKey = 'org',
  searchActive = false,
  onCloseSearch,
}: {
  embedded?: boolean;
  channelKey?: string;
  /** Inline search bar under the hub header — scrolls matches in this list. */
  searchActive?: boolean;
  onCloseSearch?: () => void;
} = {}) {
  const { user } = useAuth();
  const isGroup = channelKey === 'org';
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [receipts, setReceipts] = useState<ReadReceipt[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryReceipt[]>([]);
  const [viewerMedia, setViewerMedia] = useState<{
    type: 'IMAGE' | 'VIDEO';
    uri: string;
  } | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [matchIds, setMatchIds] = useState<string[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const hasOlderRef = useRef(false);
  const searchRequestId = useRef(0);
  const searchInputRef = useRef<TextInput>(null);

  messagesRef.current = messages;
  hasOlderRef.current = hasOlderMessages;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const history = await chatApi.getChatHistory(channelKey);
      if (cancelled) return;
      setMessages(history);
      setHasOlderMessages(history.length === chatApi.CHAT_HISTORY_PAGE_SIZE);
      await chatApi.markChatRead(channelKey).catch(() => undefined);
      chatApi.getReadReceipts(channelKey).then((r) => {
        if (!cancelled) setReceipts(r);
      }).catch(() => undefined);
      chatApi.getDeliveryReceipts(channelKey).then((d) => {
        if (!cancelled) setDeliveries(d);
      }).catch(() => undefined);

      const token = await getToken();
      if (!token || cancelled) return;

      const socket = chatApi.connectChatSocket(token);
      socketRef.current = socket;

      socket.on('connect', () => {
        setIsConnected(true);
        socket.emit('channel:join', { channelKey });
        // Loading this channel's history means it's been delivered to this
        // device — fire before channel:read so the two stay conceptually
        // distinct even though they land almost together in this flow.
        socket.emit('channel:delivered', { channelKey });
        // Also broadcasts "Seen" live to anyone else currently in this channel.
        socket.emit('channel:read', { channelKey });
      });
      socket.on('disconnect', () => setIsConnected(false));
      socket.on('message:new', (message: ChatMessage) => {
        // Every socket is joined to the org room regardless of which
        // channel screen is open, so this can fire for a channel other than
        // the one being viewed — still mark it delivered (the device got
        // it), just don't render it here or mark it read.
        socket.emit('channel:delivered', { channelKey: message.channelKey });
        if (message.channelKey && message.channelKey !== channelKey) return;
        setMessages((prev) => {
          if (prev.some((m) => m.id === message.id)) return prev;
          return [...prev, message];
        });
        void chatApi.markChatRead(channelKey);
        socket.emit('channel:read', { channelKey });
      });
      socket.on(
        'chat:read',
        (payload: { userId: string; userName: string; channelKey: string; lastReadAt: string }) => {
          if (payload.channelKey !== channelKey) return;
          if (payload.userId === user?.id) return;
          setReceipts((prev) => {
            const others = prev.filter((r) => r.userId !== payload.userId);
            return [...others, { userId: payload.userId, name: payload.userName, lastReadAt: payload.lastReadAt }];
          });
        },
      );
      socket.on(
        'chat:delivered',
        (payload: { userId: string; userName: string; channelKey: string; lastDeliveredAt: string }) => {
          if (payload.channelKey !== channelKey) return;
          if (payload.userId === user?.id) return;
          setDeliveries((prev) => {
            const others = prev.filter((d) => d.userId !== payload.userId);
            return [
              ...others,
              { userId: payload.userId, name: payload.userName, lastDeliveredAt: payload.lastDeliveredAt },
            ];
          });
        },
      );
    })();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
    };
  }, [channelKey]);

  useEffect(() => {
    // Don't yank to bottom while the user is hunting older search hits.
    if (searchActive && searchQuery) return;
    if (messages.length > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length, searchActive, searchQuery]);

  useEffect(() => {
    if (!searchActive) {
      setSearchDraft('');
      setSearchQuery('');
      setMatchIds([]);
      setMatchIndex(0);
      setHighlightId(null);
      setIsSearching(false);
      return;
    }
    const t = setTimeout(() => searchInputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [searchActive]);

  useEffect(() => {
    if (!searchActive) return;
    const handle = setTimeout(
      () => setSearchQuery(searchDraft.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(handle);
  }, [searchDraft, searchActive]);

  const scrollToMessageId = useCallback((messageId: string) => {
    const index = messagesRef.current.findIndex((m) => m.id === messageId);
    if (index < 0) return false;
    setHighlightId(messageId);
    requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.35,
        });
      } catch {
        listRef.current?.scrollToOffset({
          offset: Math.max(0, index * 72),
          animated: true,
        });
      }
    });
    return true;
  }, []);

  const ensureMessageLoaded = useCallback(
    async (messageId: string) => {
      if (messagesRef.current.some((m) => m.id === messageId)) return true;

      let guard = 20;
      while (hasOlderRef.current && guard-- > 0) {
        const oldestId = messagesRef.current[0]?.id;
        if (!oldestId) break;
        const older = await chatApi.getChatHistory(channelKey, oldestId);
        const next = [...older, ...messagesRef.current];
        messagesRef.current = next;
        setMessages(next);
        const more = older.length === chatApi.CHAT_HISTORY_PAGE_SIZE;
        hasOlderRef.current = more;
        setHasOlderMessages(more);
        if (next.some((m) => m.id === messageId)) return true;
        if (older.length === 0) break;
      }
      return messagesRef.current.some((m) => m.id === messageId);
    },
    [channelKey],
  );

  const jumpToMatch = useCallback(
    async (messageId: string | undefined) => {
      if (!messageId) {
        setHighlightId(null);
        return;
      }
      const loaded = await ensureMessageLoaded(messageId);
      if (!loaded) {
        setHighlightId(null);
        return;
      }
      // FlatList needs a beat after prepended rows settle.
      setTimeout(() => scrollToMessageId(messageId), 50);
    },
    [ensureMessageLoaded, scrollToMessageId],
  );

  useEffect(() => {
    if (!searchActive) return;
    if (!searchQuery) {
      setMatchIds([]);
      setMatchIndex(0);
      setHighlightId(null);
      setIsSearching(false);
      return;
    }

    const req = ++searchRequestId.current;
    setIsSearching(true);
    chatApi
      .searchChatMessages(channelKey, searchQuery)
      .then(async (hits) => {
        if (req !== searchRequestId.current) return;
        const ids = hits.map((h) => h.id);
        setMatchIds(ids);
        setMatchIndex(0);
        await jumpToMatch(ids[0]);
      })
      .catch(() => {
        if (req !== searchRequestId.current) return;
        setMatchIds([]);
        setMatchIndex(0);
        setHighlightId(null);
      })
      .finally(() => {
        if (req !== searchRequestId.current) return;
        setIsSearching(false);
      });
  }, [searchQuery, searchActive, channelKey, jumpToMatch]);

  const goToMatch = useCallback(
    (nextIndex: number) => {
      if (matchIds.length === 0) return;
      const wrapped =
        ((nextIndex % matchIds.length) + matchIds.length) % matchIds.length;
      setMatchIndex(wrapped);
      void jumpToMatch(matchIds[wrapped]);
    },
    [matchIds, jumpToMatch],
  );

  // The most recent message that is mine — "Seen"/"Sent" only shows there,
  // not on every bubble, mirroring how most chat apps surface receipts.
  const lastMineId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].senderId === user?.id) return messages[i].id;
    }
    return null;
  }, [messages, user?.id]);

  const seenByForLastMine = useMemo(() => {
    const message = messages.find((m) => m.id === lastMineId);
    if (!message) return [];
    const sentAt = new Date(message.createdAt).getTime();
    return receipts.filter((r) => new Date(r.lastReadAt).getTime() >= sentAt);
  }, [messages, lastMineId, receipts]);

  const deliveredForLastMine = useMemo(() => {
    const message = messages.find((m) => m.id === lastMineId);
    if (!message) return [];
    const sentAt = new Date(message.createdAt).getTime();
    return deliveries.filter((d) => new Date(d.lastDeliveredAt).getTime() >= sentAt);
  }, [messages, lastMineId, deliveries]);

  // single tick (sent) -> double grey (delivered) -> double blue (seen).
  const tickState: 'sent' | 'delivered' | 'seen' = useMemo(() => {
    if (seenByForLastMine.length > 0) return 'seen';
    if (deliveredForLastMine.length > 0) return 'delivered';
    return 'sent';
  }, [seenByForLastMine, deliveredForLastMine]);

  const onLoadOlder = useCallback(async () => {
    if (!hasOlderMessages || isLoadingOlder || messages.length === 0) return;
    setIsLoadingOlder(true);
    try {
      const older = await chatApi.getChatHistory(channelKey, messages[0].id);
      setMessages((prev) => [...older, ...prev]);
      setHasOlderMessages(older.length === chatApi.CHAT_HISTORY_PAGE_SIZE);
    } finally {
      setIsLoadingOlder(false);
    }
  }, [channelKey, hasOlderMessages, isLoadingOlder, messages]);

  const emitMessage = useCallback(
    (payload: {
      text?: string;
      mediaUrl?: string;
      mediaType?: 'IMAGE' | 'VIDEO';
    }) => {
      if (!socketRef.current) return;
      socketRef.current.emit('message:send', { channelKey, ...payload });
    },
    [channelKey],
  );

  const onSend = useCallback(() => {
    const text = draft.trim();
    if (!text || !socketRef.current) return;
    emitMessage({ text });
    setDraft('');
  }, [draft, emitMessage]);

  const onPickMedia = async (option: AttachOption) => {
    setShowAttach(false);
    const fromCamera = option === 'camera';
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow camera / gallery access to share media.');
      return;
    }
    const mediaTypes =
      option === 'video'
        ? ImagePicker.MediaTypeOptions.Videos
        : option === 'photo'
          ? ImagePicker.MediaTypeOptions.Images
          : ImagePicker.MediaTypeOptions.All;
    // Pick near-full quality — compressForUpload (WhatsApp-style) shrinks
    // bytes before the multipart POST so huge camera rolls stay manageable.
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes,
          quality: 1,
          videoMaxDuration: 180,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes,
          quality: 1,
          videoMaxDuration: 180,
        });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    try {
      const uploaded = await chatApi.uploadChatMedia({
        uri: asset.uri,
        fileName: asset.fileName ?? `chat-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
        width: asset.width,
        height: asset.height,
      });
      emitMessage({
        mediaUrl: uploaded.mediaUrl,
        mediaType: uploaded.mediaType,
        text: draft.trim() || undefined,
      });
      setDraft('');
    } catch (err: any) {
      Alert.alert(
        'Upload failed',
        err?.response?.data?.message?.toString() ?? 'Could not upload media.',
      );
    }
  };

  const body = (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: 'transparent' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {searchActive ? (
        <View style={styles.searchBar}>
          <Text style={styles.searchGlyph}>⌕</Text>
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            value={searchDraft}
            onChangeText={setSearchDraft}
            placeholder="Search in chat"
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search in chat"
          />
          {isSearching ? (
            <ActivityIndicator color={colors.chrome} size="small" />
          ) : searchQuery ? (
            <Text style={styles.searchCount} accessibilityLabel="Search match count">
              {matchIds.length === 0
                ? '0'
                : `${matchIndex + 1}/${matchIds.length}`}
            </Text>
          ) : null}
          <Pressable
            onPress={() => goToMatch(matchIndex - 1)}
            disabled={matchIds.length < 2}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Previous match"
            style={[
              styles.searchNavBtn,
              matchIds.length < 2 && styles.searchNavDisabled,
            ]}
          >
            <Text style={styles.searchNavText}>↑</Text>
          </Pressable>
          <Pressable
            onPress={() => goToMatch(matchIndex + 1)}
            disabled={matchIds.length < 2}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Next match"
            style={[
              styles.searchNavBtn,
              matchIds.length < 2 && styles.searchNavDisabled,
            ]}
          >
            <Text style={styles.searchNavText}>↓</Text>
          </Pressable>
          <Pressable
            onPress={() => onCloseSearch?.()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close search"
          >
            <Text style={styles.searchClose}>✕</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16 }}
        data={messages}
        keyExtractor={(item) => item.id}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        onStartReached={onLoadOlder}
        onStartReachedThreshold={0.3}
        onScrollToIndexFailed={({ index }) => {
          listRef.current?.scrollToOffset({
            offset: Math.max(0, index * 72),
            animated: true,
          });
          setTimeout(() => {
            try {
              listRef.current?.scrollToIndex({
                index,
                animated: true,
                viewPosition: 0.35,
              });
            } catch {
              /* ignore */
            }
          }, 80);
        }}
        ListHeaderComponent={
          isLoadingOlder ? (
            <ActivityIndicator color={colors.chrome} style={{ marginBottom: 8 }} />
          ) : null
        }
        renderItem={({ item }) => {
          const isMine = item.senderId === user?.id;
          const mediaUri = chatApi.resolveChatMediaUrl(item.mediaUrl);
          const showSeen = isMine && item.id === lastMineId;
          const isHit = highlightId === item.id;
          const tickLabel =
            tickState === 'seen'
              ? isGroup
                ? `Seen by ${seenByForLastMine.length}`
                : 'Seen'
              : tickState === 'delivered'
                ? isGroup
                  ? `Delivered to ${deliveredForLastMine.length}`
                  : 'Delivered'
                : 'Sent';
          return (
            <View
              style={[
                styles.bubbleRow,
                isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs,
              ]}
            >
              <View style={styles.bubbleCol}>
                <View
                  style={[
                    styles.bubble,
                    isMine && styles.bubbleMine,
                    isHit && styles.bubbleHit,
                  ]}
                >
                  {!isMine && (
                    <Text style={styles.sender}>{formatSenderLabel(item)}</Text>
                  )}
                  {item.mediaType === 'IMAGE' && mediaUri ? (
                    <Pressable
                      onPress={() => setViewerMedia({ type: 'IMAGE', uri: mediaUri })}
                      accessibilityLabel="View image"
                    >
                      <Image source={{ uri: mediaUri }} style={styles.media} />
                    </Pressable>
                  ) : null}
                  {item.mediaType === 'VIDEO' && mediaUri ? (
                    <Pressable
                      style={styles.videoThumb}
                      onPress={() => setViewerMedia({ type: 'VIDEO', uri: mediaUri })}
                    >
                      <Text style={styles.playIcon}>▶</Text>
                    </Pressable>
                  ) : null}
                  {item.text ? (
                    <Text style={isMine ? styles.textMine : styles.text}>
                      {item.text}
                    </Text>
                  ) : null}
                </View>
                {showSeen && (
                  <Pressable
                    onLongPress={() => setInfoOpen(true)}
                    delayLongPress={350}
                    style={styles.seenRow}
                    accessibilityLabel={tickLabel}
                  >
                    <Text
                      style={[
                        styles.tick,
                        tickState === 'seen' && styles.tickSeen,
                      ]}
                    >
                      {tickState === 'sent' ? '✓' : '✓✓'}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        }}
      />
      {!isConnected && <Text style={styles.connecting}>Connecting…</Text>}
      {showAttach && (
        <AttachMenu
          onPickMedia={onPickMedia}
          onPickEmoji={(emoji) => setDraft((prev) => prev + emoji)}
        />
      )}
      <View style={styles.inputRow}>
        <Pressable
          onPress={() => setShowAttach((v) => !v)}
          hitSlop={8}
          accessibilityLabel="Attach"
          style={styles.attachBtn}
        >
          <Text style={styles.toolIcon}>{showAttach ? '✕' : '➕'}</Text>
        </Pressable>
        <TextInput
          style={[sharedStyles.input, { flex: 1, marginBottom: 0 }]}
          placeholder="Message…"
          placeholderTextColor="#8b8f97"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={onSend}
        />
        <Pressable
          style={[styles.sendIconBtn, !draft.trim() && styles.sendIconDisabled]}
          disabled={!draft.trim()}
          onPress={onSend}
          accessibilityRole="button"
          accessibilityLabel="Send"
          hitSlop={8}
        >
          <Text style={styles.sendIcon}>➤</Text>
        </Pressable>
      </View>

      <MediaViewerModal
        visible={!!viewerMedia}
        type={viewerMedia?.type ?? null}
        uri={viewerMedia?.uri ?? null}
        onClose={() => setViewerMedia(null)}
      />
      <MessageInfoModal
        visible={infoOpen}
        deliveredTo={deliveredForLastMine.map((d) => ({ userId: d.userId, name: d.name }))}
        readBy={seenByForLastMine.map((r) => ({ userId: r.userId, name: r.name }))}
        onClose={() => setInfoOpen(false)}
      />
    </KeyboardAvoidingView>
  );

  if (embedded) return body;
  return <Screen>{body}</Screen>;
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(10,10,12,0.96)',
  },
  searchGlyph: { color: colors.textDim, fontSize: 16, fontWeight: '700' },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 15,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  searchCount: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    minWidth: 28,
    textAlign: 'center',
  },
  searchNavBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchNavDisabled: { opacity: 0.3 },
  searchNavText: { color: colors.chrome, fontSize: 16, fontWeight: '700' },
  searchClose: { color: colors.link, fontSize: 16, fontWeight: '700', paddingHorizontal: 4 },
  bubbleRow: { flexDirection: 'row', marginBottom: 10 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowTheirs: { justifyContent: 'flex-start' },
  bubbleCol: { maxWidth: '80%', alignItems: 'flex-end' },
  bubble: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'stretch',
  },
  bubbleMine: { backgroundColor: '#c9ccd1' },
  bubbleHit: {
    borderWidth: 2,
    borderColor: colors.link,
    backgroundColor: 'rgba(139, 156, 255, 0.22)',
  },
  sender: { fontSize: 11, color: '#9aa0a6', marginBottom: 2 },
  text: { color: '#f2f3f5' },
  textMine: { color: '#0a0a0c' },
  media: { width: 200, height: 160, borderRadius: 8, marginBottom: 6 },
  videoThumb: {
    width: 200,
    height: 160,
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: { color: '#fff', fontSize: 32 },
  seenRow: { marginTop: 2, paddingHorizontal: 4 },
  tick: { color: colors.textMuted, fontSize: 13 },
  tickSeen: { color: colors.link },
  connecting: { textAlign: 'center', color: '#9aa0a6', paddingBottom: 4 },
  toolIcon: { fontSize: 20, color: colors.text },
  attachBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    paddingTop: 0,
  },
  sendIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIconDisabled: { opacity: 0.35 },
  sendIcon: {
    color: '#c9ccd1',
    fontSize: 22,
    fontWeight: '700',
  },
});
