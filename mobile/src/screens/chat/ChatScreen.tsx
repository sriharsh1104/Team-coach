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
  Alert,
  ActivityIndicator,
  AppState,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Socket } from 'socket.io-client';
import { getToken } from '../../storage/tokenStorage';
import * as chatApi from '../../api/chat';
import { ReadReceipt, DeliveryReceipt } from '../../api/chat';
import { ChatMessage, ChatTeammate } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Screen } from '../../brand/Screen';
import { useSharedStyles, formatRoleBadge } from '../shared';
import { AttachMenu, AttachOption } from './AttachMenu';
import { ReminderComposer } from './ReminderComposer';
import { MediaViewerModal } from './MediaViewerModal';
import { MessageInfoModal } from './MessageInfoModal';
import { CustomSticker } from './stickerStorage';
import {
  activeMentionQuery,
  filterMentionables,
  insertMention,
  splitMentionParts,
} from './chatMentions';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { emitToast } from '../../ui/toastBus';
import { apiErrorMessage } from '../../api/apiErrorMessage';
import { setActiveChatChannel } from '../../notifications/activeChatChannel';

/** Single / short emoji-only body → render as a sticker-sized glyph. */
function isStickerEmoji(text: string | null | undefined) {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 8) return false;
  // Reject if it contains letters/digits (plain text), allow emoji + ZWJ/variation.
  return !/[\p{L}\p{N}]/u.test(trimmed);
}

function MessageText({
  text,
  knownIgns,
  mine,
}: {
  text: string;
  knownIgns: string[];
  mine: boolean;
}) {
  const styles = useThemedStyles(chatStyles);
  if (isStickerEmoji(text)) {
    return <Text style={styles.stickerEmoji}>{text.trim()}</Text>;
  }
  const parts = splitMentionParts(text, knownIgns);
  return (
    <Text style={mine ? styles.textMine : styles.text}>
      {parts.map((p, i) =>
        p.type === 'mention' ? (
          <Text key={i} style={mine ? styles.mentionMine : styles.mention}>
            {p.value}
          </Text>
        ) : (
          <Text key={i}>{p.value}</Text>
        ),
      )}
    </Text>
  );
}

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
  starredOnly = false,
}: {
  embedded?: boolean;
  channelKey?: string;
  /** Inline search bar under the hub header — scrolls matches in this list. */
  searchActive?: boolean;
  onCloseSearch?: () => void;
  /** When true, only starred / favourite messages are loaded. */
  starredOnly?: boolean;
} = {}) {
  const shared = useSharedStyles();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(chatStyles);
  const isGroup = channelKey === 'org' || channelKey === 'guild';
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [caret, setCaret] = useState(0);
  const [rosterMentionables, setRosterMentionables] = useState<ChatTeammate[]>(
    [],
  );
  const [guildMentionables, setGuildMentionables] = useState<ChatTeammate[]>(
    [],
  );
  const [isConnected, setIsConnected] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [receipts, setReceipts] = useState<ReadReceipt[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryReceipt[]>([]);
  const [viewerMedia, setViewerMedia] = useState<{
    type: 'IMAGE' | 'VIDEO';
    uri: string;
  } | null>(null);
  const [infoMessageId, setInfoMessageId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
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
  /** Stick to latest unless the user scrolls up to read history. */
  const stickToBottomRef = useRef(true);
  const initialScrollDoneRef = useRef(false);
  /** Hide list until first non-animated bottom pin — avoids top→bottom scroll flash. */
  const [listReady, setListReady] = useState(false);

  messagesRef.current = messages;
  hasOlderRef.current = hasOlderMessages;

  const scrollToLatest = useCallback((animated = false) => {
    // Never animate until the first pin finished — opening must not "fly" to bottom.
    const useAnim = animated && initialScrollDoneRef.current;
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: useAnim });
      if (!useAnim) {
        requestAnimationFrame(() => {
          listRef.current?.scrollToEnd({ animated: false });
        });
      }
    });
  }, []);

  const pinToBottom = useCallback(() => {
    scrollToLatest(false);
  }, [scrollToLatest]);

  const mentionables = useMemo(() => {
    if (channelKey === 'guild') return guildMentionables;
    if (channelKey === 'org') return rosterMentionables;
    // DM: only the peer (their channelKey matches this DM room).
    return rosterMentionables.filter((m) => m.channelKey === channelKey);
  }, [channelKey, guildMentionables, rosterMentionables]);

  const knownIgns = useMemo(
    () =>
      mentionables
        .map((m) => m.inGameName)
        .filter((v): v is string => !!v),
    [mentionables],
  );

  const mentionState = useMemo(
    () => activeMentionQuery(draft, caret),
    [draft, caret],
  );

  const mentionSuggestions = useMemo(() => {
    if (!mentionState) return [];
    return filterMentionables(mentionables, mentionState.query);
  }, [mentionState, mentionables]);


  useEffect(() => {
    let cancelled = false;
    chatApi
      .getChatChannels()
      .then((data) => {
        if (cancelled) return;
        const roster =
          data.rosterMentionables ?? data.mentionables ?? data.teammates ?? [];
        const guild = data.guildMentionables ?? [];
        setRosterMentionables(roster);
        setGuildMentionables(guild);
      })
      .catch(() => {
        if (!cancelled) {
          setRosterMentionables([]);
          setGuildMentionables([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const mergeHistory = useCallback((incoming: ChatMessage[]) => {
    setMessages((prev) => {
      // Keep any still-unreconciled optimistic rows the server hasn't echoed.
      const pending = prev.filter(
        (m) => m.id.startsWith('pending:') && !incoming.some((h) => h.clientId === m.id),
      );
      const byId = new Map<string, ChatMessage>();
      for (const m of incoming) byId.set(m.id, m);
      for (const m of pending) byId.set(m.id, m);
      return [...byId.values()].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    });
    setHasOlderMessages(incoming.length === chatApi.CHAT_HISTORY_PAGE_SIZE);
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      const history = await chatApi.getChatHistory(channelKey, undefined, {
        starredOnly,
      });
      mergeHistory(history);
      await chatApi.markChatRead(channelKey).catch(() => undefined);
    } catch {
      /* keep existing rows */
    }
  }, [channelKey, mergeHistory, starredOnly]);

  useEffect(() => {
    setActiveChatChannel(channelKey);
    stickToBottomRef.current = true;
    initialScrollDoneRef.current = false;
    setListReady(false);
    return () => {
      setActiveChatChannel(null);
    };
  }, [channelKey]);

  useEffect(() => {
    let cancelled = false;
    const scrollTimers: ReturnType<typeof setTimeout>[] = [];

    const revealList = () => {
      if (cancelled) return;
      pinToBottom();
      initialScrollDoneRef.current = true;
      setListReady(true);
    };

    (async () => {
      try {
        const history = await chatApi.getChatHistory(channelKey, undefined, {
          starredOnly,
        });
        if (cancelled) return;
        stickToBottomRef.current = true;
        mergeHistory(history);
        await chatApi.markChatRead(channelKey).catch(() => undefined);
        chatApi.getReadReceipts(channelKey).then((r) => {
          if (!cancelled) setReceipts(r);
        }).catch(() => undefined);
        chatApi.getDeliveryReceipts(channelKey).then((d) => {
          if (!cancelled) setDeliveries(d);
        }).catch(() => undefined);
      } catch {
        /* keep empty — still reveal */
      }
      if (cancelled) return;
      // Pin to bottom without animation, then reveal once settled.
      pinToBottom();
      scrollTimers.push(
        setTimeout(() => {
          if (!cancelled) pinToBottom();
        }, 50),
      );
      scrollTimers.push(setTimeout(revealList, 120));

      const token = await getToken();
      if (!token || cancelled) return;

      const socket = chatApi.connectChatSocket(token);
      socketRef.current = socket;

      socket.on('connect', () => {
        setIsConnected(true);
        socket.emit('channel:join', { channelKey });
        // Catch up anything sent while we were offline / between the first
        // history fetch and this join — otherwise a late opener sees the
        // push badge but an empty/stale thread until remount.
        void refreshHistory().then(() => {
          if (stickToBottomRef.current) scrollToLatest(false);
        });
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
          // Swap optimistic pending row (matched by clientId) for the real one.
          if (message.clientId) {
            const idx = prev.findIndex((m) => m.id === message.clientId);
            if (idx >= 0) {
              const next = prev.slice();
              next[idx] = message;
              return next;
            }
          }
          return [...prev, message];
        });
        void chatApi.markChatRead(channelKey);
        socket.emit('channel:read', { channelKey });
      });
      socket.on(
        'message:deleted',
        (payload: { channelKey?: string; ids?: string[] }) => {
          if (payload.channelKey && payload.channelKey !== channelKey) return;
          const ids = payload.ids ?? [];
          if (ids.length === 0) return;
          setMessages((prev) => prev.filter((m) => !ids.includes(m.id)));
          setSelectedIds((prev) => {
            if (prev.size === 0) return prev;
            const next = new Set(prev);
            for (const id of ids) next.delete(id);
            return next;
          });
        },
      );
      socket.on(
        'message:edited',
        (payload: { channelKey?: string; message?: ChatMessage }) => {
          if (payload.channelKey && payload.channelKey !== channelKey) return;
          const msg = payload.message;
          if (!msg?.id) return;
          setMessages((prev) =>
            prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)),
          );
        },
      );
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
      for (const t of scrollTimers) clearTimeout(t);
      const sock = socketRef.current;
      if (sock?.connected) {
        sock.emit('channel:leave', { channelKey });
      }
      sock?.disconnect();
    };
  }, [
    channelKey,
    mergeHistory,
    pinToBottom,
    refreshHistory,
    scrollToLatest,
    starredOnly,
    user?.id,
  ]);

  // Background → leave presence (resume pushes). Foreground → rejoin + catch up.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const sock = socketRef.current;
      if (state === 'active') {
        setActiveChatChannel(channelKey);
        if (sock?.connected) {
          sock.emit('channel:join', { channelKey });
        }
        void refreshHistory().then(() => {
          if (stickToBottomRef.current) scrollToLatest(false);
        });
        return;
      }
      if (state === 'background' || state === 'inactive') {
        setActiveChatChannel(null);
        if (sock?.connected) {
          sock.emit('channel:leave', { channelKey });
        }
      }
    });
    return () => sub.remove();
  }, [channelKey, refreshHistory, scrollToLatest]);

  useEffect(() => {
    // Don't yank to bottom while the user is hunting older search hits.
    if (searchActive && searchQuery) return;
    if (!stickToBottomRef.current) return;
    if (messages.length === 0) return;
    // First paint: silent pin. Later live messages: soft animated follow.
    scrollToLatest(initialScrollDoneRef.current);
  }, [messages.length, searchActive, searchQuery, scrollToLatest]);

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

  const receiptsForMessage = useCallback(
    (messageId: string | null) => {
      const message = messages.find((m) => m.id === messageId);
      if (!message) return { seenBy: [] as ReadReceipt[], deliveredTo: [] as DeliveryReceipt[] };
      const sentAt = new Date(message.createdAt).getTime();
      return {
        seenBy: receipts.filter((r) => new Date(r.lastReadAt).getTime() >= sentAt),
        deliveredTo: deliveries.filter(
          (d) => new Date(d.lastDeliveredAt).getTime() >= sentAt,
        ),
      };
    },
    [messages, receipts, deliveries],
  );

  const seenByForLastMine = useMemo(
    () => receiptsForMessage(lastMineId).seenBy,
    [receiptsForMessage, lastMineId],
  );

  const deliveredForLastMine = useMemo(
    () => receiptsForMessage(lastMineId).deliveredTo,
    [receiptsForMessage, lastMineId],
  );

  const infoReceipts = useMemo(
    () => receiptsForMessage(infoMessageId),
    [receiptsForMessage, infoMessageId],
  );

  // single tick (sent) -> double grey (delivered) -> double blue (seen).
  const tickState: 'sent' | 'delivered' | 'seen' = useMemo(() => {
    if (seenByForLastMine.length > 0) return 'seen';
    if (deliveredForLastMine.length > 0) return 'delivered';
    return 'sent';
  }, [seenByForLastMine, deliveredForLastMine]);

  const selectedList = useMemo(
    () => messages.filter((m) => selectedIds.has(m.id)),
    [messages, selectedIds],
  );

  const allSelectedAreMine = useMemo(
    () =>
      selectedList.length > 0 &&
      selectedList.every((m) => m.senderId === user?.id),
    [selectedList, user?.id],
  );

  const canShowInfo =
    selectedList.length === 1 &&
    selectedList[0]?.senderId === user?.id &&
    !selectedList[0].id.startsWith('pending:');

  const canReply =
    selectedList.length === 1 && !selectedList[0].id.startsWith('pending:');

  // Edit only while nobody else has read it (client hint; server enforces).
  const canEdit = useMemo(() => {
    if (selectedList.length !== 1) return false;
    const msg = selectedList[0];
    if (msg.senderId !== user?.id) return false;
    if (msg.id.startsWith('pending:')) return false;
    if (!msg.text?.trim()) return false;
    const { seenBy } = receiptsForMessage(msg.id);
    return seenBy.length === 0;
  }, [receiptsForMessage, selectedList, user?.id]);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) {
        setSelectMode(false);
      } else {
        setSelectMode(true);
      }
      return next;
    });
  }, []);

  const onLongPressMessage = useCallback(
    (msg: ChatMessage) => {
      if (selectMode) {
        toggleSelect(msg.id);
        return;
      }
      setSelectMode(true);
      setSelectedIds(new Set([msg.id]));
    },
    [selectMode, toggleSelect],
  );

  const onPressMessage = useCallback(
    (msg: ChatMessage) => {
      if (!selectMode) return;
      toggleSelect(msg.id);
    },
    [selectMode, toggleSelect],
  );

  const onDeleteSelected = useCallback(async () => {
    if (!allSelectedAreMine || selectedList.length === 0) return;
    const pendingIds = selectedList
      .filter((m) => m.id.startsWith('pending:'))
      .map((m) => m.id);
    const realIds = selectedList
      .filter((m) => !m.id.startsWith('pending:'))
      .map((m) => m.id);
    const removeIds = [...pendingIds, ...realIds];
    setMessages((prev) => prev.filter((m) => !removeIds.includes(m.id)));
    exitSelectMode();
    if (realIds.length === 0) return;
    try {
      const socket = socketRef.current;
      if (socket?.connected) {
        socket.emit('message:delete', { ids: realIds });
      } else {
        await chatApi.deleteMessages(realIds);
      }
    } catch {
      void chatApi.getChatHistory(channelKey).then((history) => {
        setMessages(history);
        setHasOlderMessages(history.length === chatApi.CHAT_HISTORY_PAGE_SIZE);
      });
    }
  }, [allSelectedAreMine, channelKey, exitSelectMode, selectedList]);

  const onInfoSelected = useCallback(() => {
    if (!canShowInfo) return;
    setInfoMessageId(selectedList[0].id);
    exitSelectMode();
  }, [canShowInfo, exitSelectMode, selectedList]);

  const onReplySelected = useCallback(() => {
    if (!canReply) return;
    setEditingId(null);
    setReplyTo(selectedList[0]);
    exitSelectMode();
  }, [canReply, exitSelectMode, selectedList]);

  const onEditSelected = useCallback(() => {
    if (!canEdit) return;
    const msg = selectedList[0];
    setReplyTo(null);
    setEditingId(msg.id);
    setDraft(msg.text ?? '');
    setCaret((msg.text ?? '').length);
    exitSelectMode();
  }, [canEdit, exitSelectMode, selectedList]);

  const canPinStar =
    selectedList.length === 1 && !selectedList[0].id.startsWith('pending:');

  const onPinSelected = useCallback(async () => {
    if (!canPinStar) return;
    const msg = selectedList[0];
    const next = !msg.pinned;
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, pinned: next } : m)),
    );
    exitSelectMode();
    try {
      await chatApi.setMessagePinned(channelKey, msg.id, next);
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, pinned: !next } : m)),
      );
      emitToast('Could not update pin');
    }
  }, [canPinStar, channelKey, exitSelectMode, selectedList]);

  const onStarSelected = useCallback(async () => {
    if (!canPinStar) return;
    const msg = selectedList[0];
    const next = !msg.starred;
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, starred: next } : m)),
    );
    exitSelectMode();
    try {
      await chatApi.setMessageStarred(channelKey, msg.id, next);
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, starred: !next } : m)),
      );
      emitToast('Could not update star');
    }
  }, [canPinStar, channelKey, exitSelectMode, selectedList]);

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

  const waitForSocket = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket) return null;
    if (socket.connected) return socket;
    return new Promise<typeof socket | null>((resolve) => {
      const timer = setTimeout(() => {
        socket.off('connect', onConnect);
        resolve(socket.connected ? socket : null);
      }, 8000);
      const onConnect = () => {
        clearTimeout(timer);
        resolve(socket);
      };
      socket.once('connect', onConnect);
      // Gallery/camera backgrounds the app and often drops the socket —
      // nudge a reconnect before we try to post the media message.
      try {
        socket.connect();
      } catch {
        /* ignore */
      }
    });
  }, []);

  const emitMessage = useCallback(
    async (payload: {
      text?: string;
      mediaUrl?: string;
      mediaType?: 'IMAGE' | 'VIDEO';
      clientId?: string;
      replyToId?: string;
    }) => {
      const socket = await waitForSocket();
      if (!socket?.connected) {
        emitToast('Chat disconnected — try again in a moment');
        return false;
      }
      socket.emit('message:send', { channelKey, ...payload });
      return true;
    },
    [channelKey, waitForSocket],
  );

  const onSend = useCallback(() => {
    const text = draft.trim();
    if (!text || !user) return;

    // Edit path — update in place instead of sending a new bubble.
    if (editingId) {
      const id = editingId;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, text, editedAt: new Date().toISOString() }
            : m,
        ),
      );
      setDraft('');
      setCaret(0);
      setEditingId(null);
      const socket = socketRef.current;
      if (socket?.connected) {
        socket.emit('message:edit', { id, text });
      } else {
        void chatApi.editMessage(id, text).catch(() => {
          emitToast('Could not edit message');
          void refreshHistory();
        });
      }
      return;
    }

    const clientId = `pending:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const parent = replyTo;
    const optimistic: ChatMessage = {
      id: clientId,
      channelKey,
      senderId: user.id,
      senderName: user.name ?? 'You',
      senderRole: null,
      senderIsOwner: false,
      text,
      mediaUrl: null,
      mediaType: null,
      createdAt: new Date().toISOString(),
      clientId,
      replyToId: parent?.id ?? null,
      replyTo: parent
        ? {
            id: parent.id,
            text: parent.text,
            senderName: parent.senderName,
            mediaType: parent.mediaType,
          }
        : null,
    };
    // Show immediately so the sender never sees a vanished bubble while
    // waiting for message:new (or if the echo is dropped).
    stickToBottomRef.current = true;
    setMessages((prev) =>
      prev.some((m) => m.id === clientId) ? prev : [...prev, optimistic],
    );
    setDraft('');
    setCaret(0);
    setReplyTo(null);
    void emitMessage({
      text,
      clientId,
      replyToId: parent?.id,
    }).then((ok) => {
      if (!ok) {
        setMessages((prev) => prev.filter((m) => m.id !== clientId));
        setDraft(text);
        setCaret(text.length);
        if (parent) setReplyTo(parent);
      }
    });
  }, [channelKey, draft, editingId, emitMessage, refreshHistory, replyTo, user]);

  const pickMention = useCallback(
    (mate: ChatTeammate) => {
      if (!mentionState || !mate.inGameName) return;
      const { text, caret: nextCaret } = insertMention(
        draft,
        caret,
        mentionState.start,
        mate.inGameName,
      );
      setDraft(text);
      setCaret(nextCaret);
    },
    [mentionState, draft, caret],
  );

  const onPickStickerEmoji = useCallback(
    (emoji: string) => {
      setShowAttach(false);
      if (!user) return;
      const clientId = `pending:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      const optimistic: ChatMessage = {
        id: clientId,
        channelKey,
        senderId: user.id,
        senderName: user.name ?? 'You',
        senderRole: null,
        senderIsOwner: false,
        text: emoji,
        mediaUrl: null,
        mediaType: null,
        createdAt: new Date().toISOString(),
        clientId,
      };
      stickToBottomRef.current = true;
      setMessages((prev) =>
        prev.some((m) => m.id === clientId) ? prev : [...prev, optimistic],
      );
      void emitMessage({ text: emoji, clientId }).then((ok) => {
        if (!ok) {
          setMessages((prev) => prev.filter((m) => m.id !== clientId));
        }
      });
    },
    [channelKey, emitMessage, user],
  );

  const onPickCustomSticker = useCallback(
    async (sticker: CustomSticker) => {
      setShowAttach(false);
      emitToast('Sending sticker…', 2000);
      try {
        const uploaded = await chatApi.uploadChatMedia({
          uri: sticker.uri,
          fileName: sticker.fileName,
          mimeType: sticker.mimeType,
        });
        stickToBottomRef.current = true;
        const sent = await emitMessage({
          mediaUrl: uploaded.mediaUrl,
          mediaType: uploaded.mediaType,
        });
        if (!sent) emitToast('Could not send sticker');
      } catch (err: unknown) {
        emitToast(apiErrorMessage(err, 'Could not send sticker'));
      }
    },
    [emitMessage],
  );

  const onPickMedia = async (option: AttachOption) => {
    setShowAttach(false);
    if (option === 'reminder') {
      setReminderOpen(true);
      return;
    }
    const fromCamera = option === 'camera';
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        fromCamera
          ? 'Allow camera access to take a photo and send it.'
          : 'Allow gallery access to share media.',
      );
      return;
    }
    // Camera = snap a photo and send. Gallery photo/video keep their filters.
    const mediaTypes =
      option === 'video'
        ? ImagePicker.MediaTypeOptions.Videos
        : ImagePicker.MediaTypeOptions.Images;
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes,
          quality: 1,
          allowsEditing: false,
          exif: false,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes,
          quality: 1,
          videoMaxDuration: 180,
        });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const looksVideo =
      (asset.mimeType?.startsWith('video/') ?? false) ||
      option === 'video';
    emitToast('Uploading…', 2500);
    try {
      const uploaded = await chatApi.uploadChatMedia({
        uri: asset.uri,
        fileName:
          asset.fileName ??
          (looksVideo
            ? `chat-${Date.now()}.mp4`
            : `chat-${Date.now()}.jpg`),
        mimeType:
          asset.mimeType ?? (looksVideo ? 'video/mp4' : 'image/jpeg'),
        width: asset.width,
        height: asset.height,
      });
      stickToBottomRef.current = true;
      const sent = await emitMessage({
        mediaUrl: uploaded.mediaUrl,
        mediaType: uploaded.mediaType,
        text: draft.trim() || undefined,
        replyToId: replyTo?.id,
      });
      if (sent) {
        setDraft('');
        setReplyTo(null);
        setTimeout(() => {
          void refreshHistory();
        }, 600);
      }
    } catch (err: unknown) {
      emitToast(apiErrorMessage(err, 'Could not upload media'));
    }
  };

  // Android already resizes the window (app.config softwareKeyboardLayoutMode).
  // Using behavior="height" there double-shrinks the chat and often collapses
  // the layout after the first keyboard open / screen revisit.
  const body = (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: 'transparent' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {selectMode ? (
        <View style={styles.selectBar} accessibilityRole="toolbar">
          <Pressable
            onPress={exitSelectMode}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Cancel selection"
            style={styles.selectBarBtn}
          >
            <Text style={styles.selectBarAction}>✕</Text>
          </Pressable>
          <Text style={styles.selectBarCount}>
            {selectedIds.size} selected
          </Text>
          <View style={styles.selectBarActions}>
            <Pressable
              onPress={() => void onPinSelected()}
              disabled={!canPinStar}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={
                selectedList[0]?.pinned ? 'Unpin message' : 'Pin message'
              }
              style={[styles.selectBarBtn, !canPinStar && styles.selectBarDisabled]}
            >
              <Ionicons
                name={selectedList[0]?.pinned ? 'pin' : 'pin-outline'}
                size={20}
                color={colors.link}
              />
            </Pressable>
            <Pressable
              onPress={() => void onStarSelected()}
              disabled={!canPinStar}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={
                selectedList[0]?.starred ? 'Unstar message' : 'Star message'
              }
              style={[styles.selectBarBtn, !canPinStar && styles.selectBarDisabled]}
            >
              <Ionicons
                name={selectedList[0]?.starred ? 'star' : 'star-outline'}
                size={20}
                color={colors.link}
              />
            </Pressable>
            <Pressable
              onPress={onReplySelected}
              disabled={!canReply}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Reply"
              style={[styles.selectBarBtn, !canReply && styles.selectBarDisabled]}
            >
              <Text style={styles.selectBarAction}>Reply</Text>
            </Pressable>
            <Pressable
              onPress={onEditSelected}
              disabled={!canEdit}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Edit"
              style={[styles.selectBarBtn, !canEdit && styles.selectBarDisabled]}
            >
              <Text style={styles.selectBarAction}>Edit</Text>
            </Pressable>
            <Pressable
              onPress={onInfoSelected}
              disabled={!canShowInfo}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Message info"
              style={[styles.selectBarBtn, !canShowInfo && styles.selectBarDisabled]}
            >
              <Text style={styles.selectBarAction}>Info</Text>
            </Pressable>
            <Pressable
              onPress={() => void onDeleteSelected()}
              disabled={!allSelectedAreMine}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Delete selected"
              style={[
                styles.selectBarBtn,
                !allSelectedAreMine && styles.selectBarDisabled,
              ]}
            >
              <Text style={[styles.selectBarAction, styles.selectBarDelete]}>
                Delete
              </Text>
            </Pressable>
          </View>
        </View>
      ) : searchActive ? (
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
        style={{ flex: 1, minWidth: 0, opacity: listReady ? 1 : 0 }}
        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        data={messages}
        keyExtractor={(item) => item.id}
        // Android + maintainVisibleContentPosition regularly corrupts list
        // layout after the first mount; iOS still benefits for prepend loads.
        maintainVisibleContentPosition={
          Platform.OS === 'ios' ? { minIndexForVisible: 0 } : undefined
        }
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } =
            e.nativeEvent;
          const distanceFromBottom =
            contentSize.height - layoutMeasurement.height - contentOffset.y;
          stickToBottomRef.current = distanceFromBottom < 100;
        }}
        scrollEventThrottle={16}
        onContentSizeChange={() => {
          if (!stickToBottomRef.current) return;
          if (!initialScrollDoneRef.current) {
            pinToBottom();
            return;
          }
          scrollToLatest(false);
        }}
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
          const isSelected = selectedIds.has(item.id);
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
            <Pressable
              onPress={() => onPressMessage(item)}
              onLongPress={() => onLongPressMessage(item)}
              delayLongPress={350}
              style={[
                styles.bubbleRow,
                isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs,
                isSelected && styles.bubbleRowSelected,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={
                isMine ? 'Your message' : `Message from ${item.senderName}`
              }
            >
              {selectMode ? (
                <View
                  style={[
                    styles.selectCheck,
                    isSelected && styles.selectCheckOn,
                  ]}
                >
                  {isSelected ? (
                    <Text style={styles.selectCheckMark}>✓</Text>
                  ) : null}
                </View>
              ) : null}
              <View style={styles.bubbleCol}>
                <View
                  style={[
                    styles.bubble,
                    isMine && styles.bubbleMine,
                    isHit && styles.bubbleHit,
                    isSelected && styles.bubbleSelected,
                  ]}
                >
                  {!isMine && (
                    <Text style={styles.sender}>{formatSenderLabel(item)}</Text>
                  )}
                  {item.replyTo ? (
                    <View
                      style={[
                        styles.replyQuote,
                        isMine && styles.replyQuoteMine,
                      ]}
                    >
                      <Text
                        style={[
                          styles.replyQuoteName,
                          isMine && styles.replyQuoteNameMine,
                        ]}
                        numberOfLines={1}
                      >
                        {item.replyTo.senderName}
                      </Text>
                      <Text
                        style={[
                          styles.replyQuoteText,
                          isMine && styles.replyQuoteTextMine,
                        ]}
                        numberOfLines={2}
                      >
                        {item.replyTo.text?.trim() ||
                          (item.replyTo.mediaType === 'VIDEO'
                            ? 'Video'
                            : 'Photo')}
                      </Text>
                    </View>
                  ) : null}
                  {item.mediaType === 'IMAGE' && mediaUri ? (
                    <Pressable
                      onPress={() => {
                        if (selectMode) {
                          onPressMessage(item);
                          return;
                        }
                        setViewerMedia({ type: 'IMAGE', uri: mediaUri });
                      }}
                      accessibilityLabel="View image"
                    >
                      <Image
                        source={{ uri: mediaUri }}
                        style={styles.media}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        recyclingKey={item.id}
                        // Dark placeholder so a failed CDN/proxy load is
                        // obvious instead of looking like a missing bubble.
                        placeholder={{ color: 'rgba(255,255,255,0.08)' }}
                        transition={200}
                      />
                    </Pressable>
                  ) : null}
                  {item.mediaType === 'VIDEO' && mediaUri ? (
                    <Pressable
                      style={styles.videoThumb}
                      onPress={() => {
                        if (selectMode) {
                          onPressMessage(item);
                          return;
                        }
                        setViewerMedia({ type: 'VIDEO', uri: mediaUri });
                      }}
                    >
                      <Text style={styles.playIcon}>▶</Text>
                    </Pressable>
                  ) : null}
                  {item.text ? (
                    <MessageText
                      text={item.text}
                      knownIgns={knownIgns}
                      mine={isMine}
                    />
                  ) : null}
                  <View style={styles.metaRow}>
                    {item.pinned ? (
                      <Ionicons
                        name="pin"
                        size={12}
                        color={isMine ? colors.chromeInk : colors.textDim}
                      />
                    ) : null}
                    {item.starred ? (
                      <Ionicons
                        name="star"
                        size={12}
                        color={isMine ? colors.chromeInk : colors.textDim}
                      />
                    ) : null}
                    {item.editedAt ? (
                      <Text
                        style={[
                          styles.editedLabel,
                          isMine && styles.editedLabelMine,
                        ]}
                      >
                        edited
                      </Text>
                    ) : null}
                  </View>
                </View>
                {showSeen && !selectMode && (
                  <Pressable
                    onLongPress={() => setInfoMessageId(item.id)}
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
            </Pressable>
          );
        }}
      />
      {!isConnected && <Text style={styles.connecting}>Connecting…</Text>}
      {showAttach && (
        <AttachMenu
          onPickMedia={onPickMedia}
          onPickEmoji={(emoji) => {
            setDraft((prev) => {
              const next = prev + emoji;
              setCaret(next.length);
              return next;
            });
          }}
          onPickStickerEmoji={onPickStickerEmoji}
          onPickCustomSticker={(stk) => {
            void onPickCustomSticker(stk);
          }}
        />
      )}
      <ReminderComposer
        visible={reminderOpen}
        channelKey={channelKey}
        onClose={() => setReminderOpen(false)}
      />
      {mentionSuggestions.length > 0 ? (
        <View style={styles.mentionMenu}>
          {mentionSuggestions.map((mate) => (
            <Pressable
              key={mate.userId}
              style={styles.mentionOption}
              onPress={() => pickMention(mate)}
            >
              <Text style={styles.mentionIgn}>@{mate.inGameName}</Text>
              <Text style={styles.mentionName}>{mate.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {(replyTo || editingId) && (
        <View style={styles.composeBanner}>
          <View style={styles.composeBannerBody}>
            <Text style={styles.composeBannerTitle}>
              {editingId ? 'Edit message' : `Reply to ${replyTo?.senderName}`}
            </Text>
            <Text style={styles.composeBannerPreview} numberOfLines={1}>
              {editingId
                ? draft
                : replyTo?.text?.trim() ||
                  (replyTo?.mediaType === 'VIDEO' ? 'Video' : 'Photo')}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              setReplyTo(null);
              if (editingId) {
                setEditingId(null);
                setDraft('');
                setCaret(0);
              }
            }}
            hitSlop={8}
            accessibilityLabel="Cancel compose"
          >
            <Text style={styles.composeBannerClose}>✕</Text>
          </Pressable>
        </View>
      )}
      <View style={styles.inputRow}>
        <Pressable
          onPress={() => setShowAttach((v) => !v)}
          hitSlop={8}
          accessibilityLabel="Attach"
          style={styles.attachBtn}
          disabled={!!editingId}
        >
          <Ionicons
            name={showAttach ? 'close' : 'add-circle'}
            size={28}
            color={colors.icon}
            style={editingId ? { opacity: 0.35 } : undefined}
          />
        </Pressable>
        <TextInput
          style={[
            shared.input,
            styles.composeInput,
            { flex: 1, marginBottom: 0 },
          ]}
          placeholder={
            editingId
              ? 'Edit message…'
              : replyTo
                ? 'Reply…'
                : 'Message… @IGN to mention'
          }
          placeholderTextColor={colors.textDim}
          value={draft}
          onChangeText={(text) => {
            setDraft(text);
            setCaret(text.length);
          }}
          onSelectionChange={(e) => {
            setCaret(e.nativeEvent.selection.end);
          }}
          onSubmitEditing={onSend}
        />
        <Pressable
          style={[styles.sendIconBtn, !draft.trim() && styles.sendIconDisabled]}
          disabled={!draft.trim()}
          onPress={onSend}
          accessibilityRole="button"
          accessibilityLabel={editingId ? 'Save edit' : 'Send'}
          hitSlop={8}
        >
          <Ionicons
            name={editingId ? 'checkmark-circle' : 'send'}
            size={24}
            color={colors.icon}
          />
        </Pressable>
      </View>

      <MediaViewerModal
        visible={!!viewerMedia}
        type={viewerMedia?.type ?? null}
        uri={viewerMedia?.uri ?? null}
        onClose={() => setViewerMedia(null)}
      />
      <MessageInfoModal
        visible={!!infoMessageId}
        deliveredTo={infoReceipts.deliveredTo.map((d) => ({
          userId: d.userId,
          name: d.name,
        }))}
        readBy={infoReceipts.seenBy.map((r) => ({
          userId: r.userId,
          name: r.name,
        }))}
        onClose={() => setInfoMessageId(null)}
      />
    </KeyboardAvoidingView>
  );

  if (embedded) return body;
  return <Screen>{body}</Screen>;
}

const chatStyles = (c: ThemeColors) => ({
  searchBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
    backgroundColor: c.bg,
  },
  searchGlyph: { color: c.textDim, fontSize: 16, fontWeight: '700' as const },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: c.text,
    fontSize: 15,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  searchCount: {
    color: c.textMuted,
    fontSize: 12,
    fontWeight: '600' as const,
    minWidth: 28,
    textAlign: 'center' as const,
  },
  searchNavBtn: {
    width: 28,
    height: 28,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  searchNavDisabled: { opacity: 0.3 },
  searchNavText: { color: c.chrome, fontSize: 16, fontWeight: '700' as const },
  searchClose: {
    color: c.link,
    fontSize: 16,
    fontWeight: '700' as const,
    paddingHorizontal: 4,
  },
  selectBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
    backgroundColor: c.bg,
  },
  selectBarCount: {
    flex: 1,
    color: c.text,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  selectBarActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  selectBarBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  selectBarDisabled: { opacity: 0.35 },
  selectBarAction: {
    color: c.link,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  selectBarDelete: { color: c.danger },
  composeBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: c.link,
    backgroundColor: c.surface,
  },
  composeBannerBody: { flex: 1, minWidth: 0 },
  composeBannerTitle: {
    color: c.link,
    fontSize: 12,
    fontWeight: '700' as const,
    marginBottom: 2,
  },
  composeBannerPreview: { color: c.textMuted, fontSize: 13 },
  composeBannerClose: {
    color: c.textDim,
    fontSize: 16,
    fontWeight: '700' as const,
    paddingHorizontal: 4,
  },
  replyQuote: {
    borderLeftWidth: 3,
    borderLeftColor: c.link,
    backgroundColor: c.surface,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 6,
  },
  replyQuoteMine: {
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderLeftColor: c.chromeInk,
  },
  replyQuoteName: {
    color: c.link,
    fontSize: 11,
    fontWeight: '700' as const,
    marginBottom: 1,
  },
  replyQuoteNameMine: { color: c.chromeInk },
  replyQuoteText: { color: c.textMuted, fontSize: 12 },
  replyQuoteTextMine: { color: c.chromeInk, opacity: 0.75 },
  metaRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginTop: 4,
  },
  editedLabel: {
    fontSize: 10,
    color: c.textDim,
    fontStyle: 'italic' as const,
  },
  editedLabelMine: { color: c.chromeInk, opacity: 0.55 },
  bubbleRow: {
    flexDirection: 'row' as const,
    marginBottom: 10,
    maxWidth: '100%' as const,
    alignItems: 'center' as const,
  },
  bubbleRowMine: { justifyContent: 'flex-end' as const },
  bubbleRowTheirs: { justifyContent: 'flex-start' as const },
  bubbleRowSelected: {
    backgroundColor: 'rgba(139, 156, 255, 0.12)',
    borderRadius: 8,
  },
  selectCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: c.border,
    marginHorizontal: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  selectCheckOn: {
    borderColor: c.link,
    backgroundColor: c.link,
  },
  selectCheckMark: { color: c.chromeInk, fontSize: 12, fontWeight: '800' as const },
  bubbleCol: { maxWidth: '80%' as const, minWidth: 0, alignItems: 'flex-end' as const },
  bubble: {
    backgroundColor: c.bubbleTheirs,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'stretch' as const,
    maxWidth: '100%' as const,
  },
  bubbleMine: { backgroundColor: c.bubbleMine },
  bubbleHit: {
    borderWidth: 2,
    borderColor: c.link,
    backgroundColor: 'rgba(139, 156, 255, 0.22)',
  },
  bubbleSelected: {
    borderWidth: 1.5,
    borderColor: c.link,
  },
  sender: { fontSize: 11, color: c.textMuted, marginBottom: 2 },
  text: { color: c.text, flexShrink: 1 },
  textMine: { color: c.chromeInk, flexShrink: 1 },
  stickerEmoji: { fontSize: 56, lineHeight: 64 },
  mention: { color: c.link, fontWeight: '700' as const },
  mentionMine: { color: c.chromeInk, fontWeight: '700' as const, opacity: 0.9 },
  mentionMenu: {
    marginHorizontal: 12,
    marginBottom: 4,
    borderRadius: 10,
    backgroundColor: c.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    overflow: 'hidden' as const,
  },
  mentionOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: 10,
  },
  mentionIgn: { color: c.link, fontWeight: '700' as const, fontSize: 14 },
  mentionName: { color: c.textMuted, fontSize: 12 },
  media: { width: 200, height: 160, borderRadius: 8, marginBottom: 6 },
  videoThumb: {
    width: 200,
    height: 160,
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  playIcon: { color: '#fff', fontSize: 32 },
  seenRow: { marginTop: 2, paddingHorizontal: 4 },
  tick: { color: c.textMuted, fontSize: 13 },
  tickSeen: { color: c.link },
  connecting: { textAlign: 'center' as const, color: c.textMuted, paddingBottom: 4 },
  composeInput: {
    backgroundColor: c.surface,
    borderColor: c.border,
    color: c.text,
  },
  attachBtn: {
    width: 40,
    height: 40,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  inputRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    padding: 16,
    paddingTop: 0,
    maxWidth: '100%' as const,
  },
  sendIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sendIconDisabled: { opacity: 0.35 },
});
