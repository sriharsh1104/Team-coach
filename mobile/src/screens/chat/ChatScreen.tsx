import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  AppState,
} from 'react-native';
import { Image } from 'expo-image';
import { AppIcon } from '../../ui/AppIcon';
import { IconActionButton } from '../../ui/IconActionButton';
import * as ImagePicker from 'expo-image-picker';
import { Socket } from 'socket.io-client';
import { getToken } from '../../storage/tokenStorage';
import * as chatApi from '../../api/chat';
import { ReadReceipt, DeliveryReceipt } from '../../api/chat';
import { ChatMessage, ChatReaction, ChatTeammate, UserPresence } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Screen } from '../../brand/Screen';
import { useSharedStyles } from '../shared';
import { AttachMenu, AttachOption } from './AttachMenu';
import { CameraPreviewModal } from './CameraPreviewModal';
import { PointsCalculatorModal } from './PointsCalculatorModal';
import { ParsedSummary, parsePointsSummary } from '../../data/pointsCalculator';
import { ReminderComposer } from './ReminderComposer';
import { MediaViewerModal } from './MediaViewerModal';
import { MessageInfoModal } from './MessageInfoModal';
import { CustomSticker } from './stickerStorage';
import { ReactionPicker } from './ReactionPicker';
import { ForwardSheet } from './ForwardSheet';
import { ShareClipSheet } from './ShareClipSheet';
import { shareChatMessageExternally } from './shareChatMessage';
import { saveMediaToGallery } from './saveMediaToGallery';
import { VoiceRecorderButton } from './VoiceRecorderButton';
import { ChatStatusLine, presenceLabel, typingLabel } from './ChatStatusLine';
import {
  activeMentionQuery,
  filterMentionables,
  insertMention,
} from './chatMentions';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { isOnline } from '../../net/networkStatus';
import { haptic } from '../../ui/haptics';
import { emitToast } from '../../ui/toastBus';
import { apiErrorMessage } from '../../api/apiErrorMessage';
import { useRecording } from '../../recording/RecordingContext';
import { setActiveChatChannel } from '../../notifications/activeChatChannel';

import { chatStyles } from './chatStyles';
import { MessageBubble } from './MessageBubble';
import { formatMessageTime } from './messageFormat';
import { PendingUpload } from './pendingUpload';
import { ImageCropModal, CroppedImage } from './ImageCropModal';

// Re-exported from its own module so the message bubble can import it
// without pulling this whole screen in.
export { formatMessageTime };

const SEARCH_DEBOUNCE_MS = 300;


export function ChatScreen({
  embedded = false,
  channelKey = 'org',
  searchActive = false,
  onCloseSearch,
  starredOnly = false,
  onPeerPresenceChange,
}: {
  embedded?: boolean;
  channelKey?: string;
  /** Inline search bar under the hub header — scrolls matches in this list. */
  searchActive?: boolean;
  onCloseSearch?: () => void;
  /** When true, only starred / favourite messages are loaded. */
  starredOnly?: boolean;
  /** DM peer online/last-seen — hub uses this for the header avatar pip. */
  onPeerPresenceChange?: (presence: UserPresence | null) => void;
} = {}) {
  const shared = useSharedStyles();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(chatStyles);
  const { startRecording, pendingShare, clearPendingShare } = useRecording();
  const isGroup = channelKey === 'org' || channelKey === 'guild';
  // DM channel keys are `dm:{userA}:{userB}` (sorted) — the other id is the peer.
  const dmPeerId = useMemo(() => {
    if (!channelKey.startsWith('dm:') || !user?.id) return null;
    return channelKey.slice(3).split(':').find((id) => id !== user.id) ?? null;
  }, [channelKey, user?.id]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Media bubbles that are still uploading / sending / failed, keyed by the
  // optimistic message id (clientId). The bubble shows the picked file from
  // the device right away with a progress ring (WhatsApp-style) instead of
  // nothing-then-a-toast; message:new swaps it for the real row.
  const [uploads, setUploads] = useState<Record<string, PendingUpload>>({});
  const uploadJobsRef = useRef<Map<string, PendingUpload>>(new Map());
  // onPressMessage is declared before the upload helpers; route through a ref.
  const onPressPendingMediaRef = useRef<(clientId: string) => void>(() => {});
  const clearPendingUpload = useCallback((clientId: string) => {
    uploadJobsRef.current.delete(clientId);
    setUploads((prev) => {
      if (!prev[clientId]) return prev;
      const next = { ...prev };
      delete next[clientId];
      return next;
    });
  }, []);
  const patchPendingUpload = useCallback(
    (clientId: string, patch: Partial<PendingUpload>) => {
      const job = uploadJobsRef.current.get(clientId);
      if (!job) return;
      const next = { ...job, ...patch };
      uploadJobsRef.current.set(clientId, next);
      setUploads((prev) => ({ ...prev, [clientId]: next }));
    },
    [],
  );
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
  // Why the live socket isn't up (shown under "Connecting…" so it's diagnosable).
  const [connectError, setConnectError] = useState<string | null>(null);
  const [showAttach, setShowAttach] = useState(false);
  const [voiceNoteActive, setVoiceNoteActive] = useState(false);
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
  // userId -> userName, for everyone currently typing in this channel.
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [peerPresence, setPeerPresence] = useState<UserPresence | null>(null);
  const onPeerPresenceChangeRef = useRef(onPeerPresenceChange);
  onPeerPresenceChangeRef.current = onPeerPresenceChange;
  useEffect(() => {
    onPeerPresenceChangeRef.current?.(peerPresence);
  }, [peerPresence]);
  useEffect(() => {
    return () => onPeerPresenceChangeRef.current?.(null);
  }, [channelKey]);
  const [reactionTarget, setReactionTarget] = useState<ChatMessage | null>(null);
  const [forwardTarget, setForwardTarget] = useState<ChatMessage | null>(null);
  const [shareClipOpen, setShareClipOpen] = useState(false);
  const [shareClipTarget, setShareClipTarget] = useState<ChatMessage | null>(null);
  // Which pinned message the top banner currently shows, when more than one
  // is pinned — cycled with the chevron, same idea as WhatsApp's pinned bar.
  const [pinnedCursor, setPinnedCursor] = useState(0);
  const typingActiveRef = useRef(false);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // Newest first for the inverted list (index 0 = visual bottom).
  const listDataNewestFirst = useMemo(() => {
    if (messages.length <= 1) return messages;
    const next = messages.slice();
    next.reverse();
    return next;
  }, [messages]);

  const scrollToLatest = useCallback((animated = false) => {
    // inverted FlatList: offset 0 is the newest messages (visual bottom).
    const useAnim = animated && initialScrollDoneRef.current;
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: useAnim });
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

  const avatarByUserId = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const m of [...rosterMentionables, ...guildMentionables]) {
      if (!map.has(m.userId)) map.set(m.userId, m.avatarUrl);
    }
    return map;
  }, [rosterMentionables, guildMentionables]);

  // @all is only a thing in a group chat (team roster / guild) — a DM
  // already has just the one other person.
  const knownIgns = useMemo(
    () => [
      ...(isGroup ? ['all'] : []),
      ...mentionables.map((m) => m.inGameName).filter((v): v is string => !!v),
    ],
    [mentionables, isGroup],
  );

  const mentionState = useMemo(
    () => activeMentionQuery(draft, caret),
    [draft, caret],
  );

  const mentionSuggestions = useMemo(() => {
    if (!mentionState) return [];
    const filtered = filterMentionables(mentionables, mentionState.query);
    if (!isGroup) return filtered;
    if (!'all'.startsWith(mentionState.query.toLowerCase())) return filtered;
    const allCandidate: ChatTeammate = {
      userId: '__all__',
      name: 'Everyone',
      avatarUrl: null,
      inGameName: 'all',
      channelKey,
    };
    return [allCandidate, ...filtered];
  }, [mentionState, mentionables, isGroup, channelKey]);


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
    setTypingUsers(new Map());
    setPeerPresence(null);
    return () => {
      setActiveChatChannel(null);
    };
  }, [channelKey]);

  useEffect(() => {
    let cancelled = false;
    // Listener removers for the shared socket; run on unmount / channel change.
    const detach: Array<() => void> = [];

    const revealList = () => {
      if (cancelled) return;
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
      // inverted list already shows newest at the bottom — no scroll-to-end flash.
      revealList();

      const token = await getToken();
      if (!token || cancelled) return;

      // Shared app socket: attach our listeners, detach them on unmount.
      const socket = chatApi.connectChatSocket(token);
      socketRef.current = socket;
      const listen = (event: string, handler: (...args: any[]) => void) => {
        socket.on(event, handler);
        detach.push(() => socket.off(event, handler));
      };
      const joinChannel = () => {
        socket.emit('channel:join', { channelKey });
        // Loading this channel's history means it's been delivered to this
        // device — fire before channel:read so the two stay conceptually
        // distinct even though they land almost together in this flow.
        socket.emit('channel:delivered', { channelKey });
        // Also broadcasts "Seen" live to anyone else currently in this channel.
        socket.emit('channel:read', { channelKey });
        if (dmPeerId) {
          socket.emit(
            'presence:get',
            { userIds: [dmPeerId] },
            (ack: { ok?: boolean; presence?: Record<string, UserPresence> }) => {
              if (cancelled) return;
              const peer = ack?.presence?.[dmPeerId];
              if (ack?.ok && peer) setPeerPresence(peer);
            },
          );
        }
      };

      // Usually already connected (shared socket) — no "Connecting…" flash.
      setIsConnected(socket.connected);
      if (socket.connected) joinChannel();

      listen('connect_error', (err: { message?: string } | undefined) => {
        setConnectError(err?.message || 'connection failed');
      });
      listen('connect', () => {
        setIsConnected(true);
        setConnectError(null);
        joinChannel();
        // Catch up anything sent while we were offline / between the first
        // history fetch and this join — otherwise a late opener sees the
        // push badge but an empty/stale thread until remount.
        void refreshHistory().then(() => {
          if (stickToBottomRef.current) scrollToLatest(false);
        });
      });
      listen('disconnect', () => setIsConnected(false));
      listen('message:new', (message: ChatMessage) => {
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
        if (message.clientId) clearPendingUpload(message.clientId);
        // Warm disk cache so reopen / scroll-back hits local pixels, not the CDN.
        const warmUri = chatApi.resolveChatMediaUrl(message.mediaUrl);
        if (message.mediaType === 'IMAGE' && warmUri) {
          void Image.prefetch(warmUri, 'memory-disk');
        }
        void chatApi.markChatRead(channelKey);
        socket.emit('channel:read', { channelKey });
      });
      listen(
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
      listen(
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
      listen(
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
      listen(
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
      listen(
        'typing:update',
        (payload: { channelKey?: string; userId: string; userName: string; typing: boolean }) => {
          if (payload.channelKey !== channelKey) return;
          if (payload.userId === user?.id) return;
          setTypingUsers((prev) => {
            const next = new Map(prev);
            if (payload.typing) next.set(payload.userId, payload.userName);
            else next.delete(payload.userId);
            return next;
          });
        },
      );
      listen(
        'message:reaction',
        (payload: { messageId: string; reactions: ChatReaction[] }) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === payload.messageId ? { ...m, reactions: payload.reactions } : m,
            ),
          );
        },
      );
      listen(
        'presence:update',
        (payload: { userId: string; online: boolean; lastSeenAt: string | null }) => {
          if (!dmPeerId || payload.userId !== dmPeerId) return;
          setPeerPresence({ online: payload.online, lastSeenAt: payload.lastSeenAt });
        },
      );
    })();

    return () => {
      cancelled = true;
      const sock = socketRef.current;
      // Leaving the channel while still "typing" would otherwise leave
      // everyone else stuck seeing "X is typing…" forever.
      if (typingStopTimerRef.current) {
        clearTimeout(typingStopTimerRef.current);
        typingStopTimerRef.current = null;
      }
      if (typingActiveRef.current && sock?.connected) {
        sock.emit('typing:stop', { channelKey });
      }
      typingActiveRef.current = false;
      if (sock?.connected) {
        sock.emit('channel:leave', { channelKey });
      }
      // Keep the shared socket open for the rest of the app; only drop our listeners.
      for (const off of detach) off();
      detach.length = 0;
    };
  }, [
    channelKey,
    clearPendingUpload,
    dmPeerId,
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
    const chronological = messagesRef.current.findIndex((m) => m.id === messageId);
    if (chronological < 0) return false;
    // inverted + newest-first data: visual index is reversed.
    const index = messagesRef.current.length - 1 - chronological;
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

  // Members this message hasn't reached yet — everyone expected in the
  // channel minus whoever already shows as delivered or read. Groups use
  // mentionables; DMs fall back to the peer id + best-known name.
  const infoPending = useMemo(() => {
    const accountedFor = new Set([
      ...infoReceipts.deliveredTo.map((d) => d.userId),
      ...infoReceipts.seenBy.map((r) => r.userId),
    ]);
    let candidates = mentionables.map((m) => ({
      userId: m.userId,
      name: m.name,
    }));
    if (!isGroup && candidates.length === 0 && dmPeerId) {
      const fromMsg = messages.find((m) => m.senderId === dmPeerId)?.senderName;
      candidates = [{ userId: dmPeerId, name: fromMsg || 'Member' }];
    }
    return candidates.filter((m) => !accountedFor.has(m.userId));
  }, [isGroup, mentionables, infoReceipts, dmPeerId, messages]);

  // Fresh receipts whenever Message Info opens (and every few seconds while
  // open) so the sheet doesn't show stale delivered/read after a peer ACKed
  // while this screen was idle.
  useEffect(() => {
    if (!infoMessageId) return;
    let cancelled = false;
    const refresh = () => {
      void Promise.all([
        chatApi.getReadReceipts(channelKey),
        chatApi.getDeliveryReceipts(channelKey),
      ])
        .then(([r, d]) => {
          if (cancelled) return;
          setReceipts(r);
          setDeliveries(d);
        })
        .catch(() => undefined);
    };
    refresh();
    const timer = setInterval(refresh, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [infoMessageId, channelKey]);

  // single tick (sent) -> double grey (delivered) -> double blue (seen).
  // In a group (org/guild) chat this must mean ALL other members, not just
  // one — same as WhatsApp groups. `mentionables` is already "every other
  // member of this channel" (self excluded server-side), so it's the right
  // denominator with no extra plumbing. A DM only ever has one other member.
  const tickState: 'sent' | 'delivered' | 'seen' = useMemo(() => {
    const otherCount = isGroup ? mentionables.length : 1;
    if (otherCount > 0 && seenByForLastMine.length >= otherCount) return 'seen';
    if (otherCount > 0 && deliveredForLastMine.length >= otherCount) return 'delivered';
    return 'sent';
  }, [isGroup, mentionables, seenByForLastMine, deliveredForLastMine]);

  // Same for every bubble, so it's computed once here rather than per row.
  const tickLabel = useMemo(() => {
    if (tickState === 'seen') {
      return isGroup ? `Seen by ${seenByForLastMine.length}` : 'Seen';
    }
    if (tickState === 'delivered') {
      return isGroup
        ? `Delivered to ${deliveredForLastMine.length}`
        : 'Delivered';
    }
    return 'Sent';
  }, [tickState, isGroup, seenByForLastMine.length, deliveredForLastMine.length]);

  // `messages` is already chronological (oldest -> newest) — same order the
  // pinned banner cycles through.
  const pinnedMessages = useMemo(
    () => messages.filter((m) => m.pinned),
    [messages],
  );

  useEffect(() => {
    setPinnedCursor((c) =>
      pinnedMessages.length === 0 ? 0 : Math.min(c, pinnedMessages.length - 1),
    );
  }, [pinnedMessages.length]);

  const pinnedPreviewFor = useCallback((m: ChatMessage | undefined) => {
    if (!m) return '';
    if (m.text?.trim()) return m.text.trim();
    if (m.mediaType === 'VIDEO') return 'Video';
    if (m.mediaType === 'AUDIO') return 'Voice note';
    if (m.mediaType === 'IMAGE') return 'Photo';
    return '';
  }, []);

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
      if (uploadJobsRef.current.has(msg.id)) {
        onPressPendingMediaRef.current(msg.id);
        return;
      }
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
    for (const id of pendingIds) clearPendingUpload(id);
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
  }, [allSelectedAreMine, channelKey, clearPendingUpload, exitSelectMode, selectedList]);

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

  const onReactSelected = useCallback(() => {
    if (!canReply) return;
    setReactionTarget(selectedList[0]);
    exitSelectMode();
  }, [canReply, exitSelectMode, selectedList]);

  const onSharePressSelected = useCallback(() => {
    if (!canReply) return;
    setShareClipTarget(selectedList[0]);
    setShareClipOpen(true);
  }, [canReply, selectedList]);

  const onShareOutside = useCallback(async () => {
    const msg = shareClipTarget;
    setShareClipOpen(false);
    setShareClipTarget(null);
    exitSelectMode();
    if (!msg) return;
    const mediaUrl =
      chatApi.resolveChatMediaUrl(msg.mediaUrl) ||
      uploads[msg.id]?.asset.uri ||
      null;
    try {
      await shareChatMessageExternally({
        text: msg.text,
        mediaUrl,
        mediaType: msg.mediaType,
      });
    } catch {
      emitToast('Could not share');
    }
  }, [exitSelectMode, shareClipTarget, uploads]);

  const onForwardFromShareClip = useCallback(() => {
    const msg = shareClipTarget;
    setShareClipOpen(false);
    setShareClipTarget(null);
    if (!msg) return;
    setForwardTarget(msg);
    exitSelectMode();
  }, [exitSelectMode, shareClipTarget]);

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

  const canSaveToGallery =
    selectedList.length === 1 &&
    (selectedList[0].mediaType === 'IMAGE' || selectedList[0].mediaType === 'VIDEO') &&
    !!(
      chatApi.resolveChatMediaUrl(selectedList[0].mediaUrl) ||
      uploads[selectedList[0].id]?.asset.uri
    );

  const onSaveSelectedToGallery = useCallback(async () => {
    if (!canSaveToGallery) return;
    const msg = selectedList[0];
    const type = msg.mediaType === 'VIDEO' ? 'VIDEO' : 'IMAGE';
    const uri =
      chatApi.resolveChatMediaUrl(msg.mediaUrl) ||
      uploads[msg.id]?.asset.uri ||
      null;
    if (!uri) return;
    exitSelectMode();
    try {
      await saveMediaToGallery(uri, type);
    } catch {
      emitToast('Could not save to gallery');
    }
  }, [canSaveToGallery, exitSelectMode, selectedList, uploads]);

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
    // With no data connection the 8s reconnect window below can only ever
    // time out — give up now so the bubble flips to "failed" (and offers
    // retry) immediately instead of after an eight-second stall.
    if (!isOnline()) return null;
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
      mediaType?: 'IMAGE' | 'VIDEO' | 'AUDIO';
      clientId?: string;
      replyToId?: string;
    }) => {
      const socket = await waitForSocket();
      if (!socket?.connected) {
        emitToast(
          isOnline()
            ? 'Chat disconnected — try again in a moment'
            : "You're offline — tap the message to retry once you reconnect",
        );
        return false;
      }
      // Server acks { ok, id } (or { ok: false, error }). A dropped socket or
      // a server-side rejection used to vanish silently; now the caller can
      // keep the bubble in a "failed" state with retry.
      return new Promise<boolean>((resolve) => {
        socket
          .timeout(15_000)
          .emit(
            'message:send',
            { channelKey, ...payload },
            (err: unknown, ack?: { ok?: boolean; error?: string }) => {
              if (err) {
                emitToast('Message not confirmed — check your connection');
                resolve(false);
                return;
              }
              if (ack && ack.ok === false) {
                emitToast(ack.error || 'Could not send message');
                resolve(false);
                return;
              }
              resolve(true);
            },
          );
      });
    },
    [channelKey, waitForSocket],
  );

  // Debounced typing:start, auto-clearing typing:stop after a pause — mirrors
  // WhatsApp's "stops showing typing… a few seconds after you stop typing".
  const notifyTyping = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      socket.emit('typing:start', { channelKey });
    }
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = setTimeout(() => {
      typingStopTimerRef.current = null;
      typingActiveRef.current = false;
      socketRef.current?.emit('typing:stop', { channelKey });
    }, 3000);
  }, [channelKey]);

  const clearTypingNow = useCallback(() => {
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      socketRef.current?.emit('typing:stop', { channelKey });
    }
  }, [channelKey]);

  const onToggleReaction = useCallback((messageId: string, emoji: string) => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      emitToast('Chat disconnected — try again in a moment');
      return;
    }
    socket
      .timeout(8000)
      .emit(
        'message:react',
        { messageId, emoji },
        (err: unknown, ack?: { ok?: boolean; reactions?: ChatReaction[]; error?: string }) => {
          if (err || !ack?.ok) {
            emitToast(ack?.error || 'Could not react');
            return;
          }
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, reactions: ack.reactions } : m)),
          );
        },
      );
  }, []);

  const onForwardSelected = useCallback(
    async (toChannelKeys: string[]) => {
      const target = forwardTarget;
      if (!target) return;
      const socket = await waitForSocket();
      if (!socket?.connected) {
        throw new Error('Chat disconnected — try again in a moment');
      }
      await new Promise<void>((resolve, reject) => {
        socket
          .timeout(15_000)
          .emit(
            'message:forward',
            { messageId: target.id, toChannelKeys },
            (
              err: unknown,
              ack?: { ok?: boolean; error?: string; results?: Array<{ channelKey: string; ok: boolean; error?: string }> },
            ) => {
              if (err || !ack?.ok) {
                reject(new Error(ack?.error || 'Could not forward'));
                return;
              }
              const results = ack.results ?? [];
              if (results.length > 0 && results.every((r) => !r.ok)) {
                reject(new Error(results[0]?.error || 'Could not forward'));
                return;
              }
              resolve();
            },
          );
      });
      emitToast('Message forwarded');
    },
    [forwardTarget, waitForSocket],
  );

  const onSend = useCallback(() => {
    const text = draft.trim();
    if (!text || !user) return;
    // Confirms the tap landed before the bubble animates in — the send
    // button sits under the thumb, where the eye usually isn't.
    haptic('light');

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
      clearTypingNow();
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
    clearTypingNow();
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
  }, [channelKey, clearTypingNow, draft, editingId, emitMessage, refreshHistory, replyTo, user]);

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

  /**
   * Upload the picked file, then send the message — driving the bubble's
   * progress ring the whole way. Safe to call again for a retry.
   */
  const runPendingUpload = useCallback(
    async (clientId: string) => {
      const job = uploadJobsRef.current.get(clientId);
      // Only a fresh ('queued') or failed job may (re)start — never double-run.
      if (!job || (job.status !== 'queued' && job.status !== 'failed')) return;
      const controller = new AbortController();
      patchPendingUpload(clientId, {
        status: 'uploading',
        progress: 0,
        label: 'Preparing…',
        error: undefined,
        controller,
      });
      try {
        const uploaded = await chatApi.uploadChatMedia(job.asset, {
          signal: controller.signal,
          onProgress: ({ phase, fraction }) =>
            patchPendingUpload(clientId, {
              progress: fraction,
              label:
                phase === 'preparing'
                  ? 'Preparing…'
                  : phase === 'finalizing'
                    ? 'Almost done…'
                    : `${job.sizeLabel ? `${job.sizeLabel} · ` : ''}Uploading…`,
            }),
        });
        patchPendingUpload(clientId, { status: 'sending', progress: 1, label: 'Sending…' });
        stickToBottomRef.current = true;
        const sent = await emitMessage({
          mediaUrl: uploaded.mediaUrl,
          mediaType: uploaded.mediaType,
          text: job.text || undefined,
          replyToId: job.replyToId ?? undefined,
          clientId,
        });
        if (!sent) {
          patchPendingUpload(clientId, { status: 'failed', error: 'Could not send' });
          return;
        }
        // message:new (echo with clientId) swaps the bubble and clears the job.
        setTimeout(() => {
          void refreshHistory();
        }, 600);
      } catch (err: unknown) {
        // The user cancelled: the bubble is already gone, so do not bring it
        // back as a failure they have to dismiss.
        if (controller.signal.aborted) return;
        patchPendingUpload(clientId, {
          status: 'failed',
          error: apiErrorMessage(err, 'Upload failed — file may be too large'),
        });
      }
    },
    [emitMessage, patchPendingUpload, refreshHistory],
  );

  const startMediaSend = useCallback(
    (
      asset: PendingUpload['asset'],
      mediaType: 'IMAGE' | 'VIDEO' | 'AUDIO',
      extras: { text?: string; replyTo?: ChatMessage | null; sizeLabel?: string | null } = {},
    ) => {
      if (!user) return;
      const clientId = `pending:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      const parent = extras.replyTo ?? null;
      const optimistic: ChatMessage = {
        id: clientId,
        channelKey,
        senderId: user.id,
        senderName: user.name ?? 'You',
        senderRole: null,
        senderIsOwner: false,
        text: extras.text?.trim() || null,
        // Local on-device URI — resolveMediaUrl passes file:/content: through.
        mediaUrl: asset.uri,
        mediaType,
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
      const job: PendingUpload = {
        asset,
        mediaType,
        text: extras.text?.trim() || undefined,
        replyToId: parent?.id ?? null,
        sizeLabel: extras.sizeLabel ?? null,
        status: 'queued',
        progress: 0,
        label: 'Preparing…',
      };
      uploadJobsRef.current.set(clientId, job);
      setUploads((prev) => ({ ...prev, [clientId]: job }));
      stickToBottomRef.current = true;
      setMessages((prev) =>
        prev.some((m) => m.id === clientId) ? prev : [...prev, optimistic],
      );
      void runPendingUpload(clientId);
    },
    [channelKey, runPendingUpload, user],
  );

  /**
   * Cancel an upload the user is tired of waiting on. Most of the "stuck"
   * cases sit at 95%: every byte is sent and the CDN has not answered yet, so
   * only aborting the request itself gets them out of it. The bubble goes
   * away with it — the file is still in their gallery to send again.
   */
  const onCancelPendingMedia = useCallback(
    (message: ChatMessage) => {
      const clientId = message.id;
      const job = uploadJobsRef.current.get(clientId);
      if (!job || job.status === 'failed') return;
      job.controller?.abort();
      uploadJobsRef.current.delete(clientId);
      setUploads((prev) => {
        const next = { ...prev };
        delete next[clientId];
        return next;
      });
      setMessages((prev) => prev.filter((m) => m.id !== clientId));
      emitToast('Upload cancelled');
    },
    [],
  );

  const onPressPendingMedia = useCallback(
    (clientId: string) => {
      const job = uploadJobsRef.current.get(clientId);
      if (!job) return;
      if (job.status !== 'failed') return; // still in flight — nothing to do
      // Tap the try-again icon → resend immediately (same local file).
      // Long-press → select → Delete still removes a stuck bubble.
      void runPendingUpload(clientId);
    },
    [runPendingUpload],
  );
  onPressPendingMediaRef.current = onPressPendingMedia;

  const onPickCustomSticker = useCallback(
    (sticker: CustomSticker) => {
      setShowAttach(false);
      startMediaSend(
        { uri: sticker.uri, fileName: sticker.fileName, mimeType: sticker.mimeType },
        'IMAGE',
      );
    },
    [startMediaSend],
  );

  const [cameraShot, setCameraShot] = useState<{
    asset: ImagePicker.ImagePickerAsset;
    option: AttachOption;
  } | null>(null);

  // A screen recording started from this chat just finished — ask before sending.
  useEffect(() => {
    if (!pendingShare || pendingShare.channelKey !== channelKey) return;
    const name = `recording-${Date.now()}.mp4`;
    setCameraShot({
      asset: {
        uri: pendingShare.uri,
        width: 0,
        height: 0,
        type: 'video',
        mimeType: 'video/mp4',
        fileName: name,
      } as ImagePicker.ImagePickerAsset,
      option: 'record',
    });
    clearPendingShare();
  }, [pendingShare, channelKey, clearPendingShare]);

  const [pointsOpen, setPointsOpen] = useState(false);
  // Set when continuing a table that is already posted in this chat.
  const [pointsSeed, setPointsSeed] = useState<ParsedSummary | null>(null);

  /** "Add match" on the latest points-table bubble reopens the calculator. */
  const onAddMatch = useCallback((parsed: ParsedSummary) => {
    setPointsSeed(parsed);
    setPointsOpen(true);
  }, []);

  // Each points series (by title) keeps "Add match" on its newest bubble so a
  // freshly posted second table does not steal continue from the previous one.
  const latestPointsIds = useMemo(() => {
    const bestByTitle = new Map<string, ChatMessage>();
    for (const m of messages) {
      const parsed = parsePointsSummary(m.text);
      if (!parsed) continue;
      const prev = bestByTitle.get(parsed.title);
      if (!prev || new Date(m.createdAt).getTime() >= new Date(prev.createdAt).getTime()) {
        bestByTitle.set(parsed.title, m);
      }
    }
    return new Set([...bestByTitle.values()].map((m) => m.id));
  }, [messages]);

  const onPickMedia = async (option: AttachOption) => {
    setShowAttach(false);
    if (option === 'voiceNote') {
      setVoiceNoteActive(true);
      return;
    }
    if (option === 'points') {
      setPointsSeed(null);
      setPointsOpen(true);
      return;
    }
    if (option === 'reminder') {
      setReminderOpen(true);
      return;
    }
    if (option === 'screenShare' || option === 'record') {
      // Start background screen recording — recording widget appears at top,
      // user switches to their game. Stop from the widget or notification.
      // Remember this chat so we can offer "send this recording?" when it stops.
      await startRecording(channelKey);
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
    // Camera photo and video: confirm in a preview, then send. Gallery photo sends directly.
    const mediaTypes =
      option === 'video'
        ? ImagePicker.MediaTypeOptions.Videos
        : ImagePicker.MediaTypeOptions.Images;
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes,
          quality: 0.7,
          allowsEditing: false,
          exif: false,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes,
          quality: 0.7,
          videoMaxDuration: 180,
        });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    // Ask "send this?" first for camera photos and videos instead of
    // sending the instant they're captured/picked.
    if (fromCamera || option === 'video') {
      setCameraShot({ asset, option });
      return;
    }
    // A picked photo opens the cropper, where Send is one tap away and an
    // untouched frame skips the work entirely.
    setCropShot({ asset, option });
  };

  /** Gallery photo waiting in the cropper. */
  const [cropShot, setCropShot] = useState<{
    asset: ImagePicker.ImagePickerAsset;
    option: AttachOption;
  } | null>(null);

  const onCropDone = (out: CroppedImage) => {
    const shot = cropShot;
    setCropShot(null);
    if (!shot) return;
    sendPickedAsset(
      {
        ...shot.asset,
        uri: out.uri,
        width: out.width,
        height: out.height,
        // A cropped file is a fresh JPEG, so the original name/size no longer
        // describe it.
        fileName: shot.asset.fileName ?? `chat-${Date.now()}.jpg`,
        mimeType:
          out.uri === shot.asset.uri
            ? (shot.asset.mimeType ?? 'image/jpeg')
            : 'image/jpeg',
        fileSize: out.uri === shot.asset.uri ? shot.asset.fileSize : undefined,
      },
      shot.option,
    );
  };

  /** Bubble + upload for an asset the user picked (or confirmed from camera). */
  const sendPickedAsset = (asset: ImagePicker.ImagePickerAsset, option: AttachOption) => {
    const looksVideo =
      (asset.mimeType?.startsWith('video/') ?? false) ||
      option === 'video';
    const sizeLabel = asset.fileSize
      ? `${(asset.fileSize / (1024 * 1024)).toFixed(1)} MB`
      : null;
    const text = draft.trim();
    const parent = replyTo;
    // Bubble appears instantly with the local file + progress ring; the
    // composer is cleared right away like a text send.
    setDraft('');
    setCaret(0);
    setReplyTo(null);
    startMediaSend(
      {
        uri: asset.uri,
        fileName:
          asset.fileName ??
          (looksVideo ? `chat-${Date.now()}.mp4` : `chat-${Date.now()}.jpg`),
        mimeType: asset.mimeType ?? (looksVideo ? 'video/mp4' : 'image/jpeg'),
        width: asset.width,
        height: asset.height,
      },
      looksVideo ? 'VIDEO' : 'IMAGE',
      { text, replyTo: parent, sizeLabel },
    );
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
        <View style={styles.selectBar} accessibilityRole="toolbar" pointerEvents="box-none">
          <IconActionButton
            plain
            icon="close"
            label="Cancel selection"
            tooltip="Close"
            color={colors.icon}
            iconSize={22}
            style={styles.selectBarClose}
            onPress={exitSelectMode}
          />
          <Text style={styles.selectBarCount} accessibilityLabel={`${selectedIds.size} selected`}>
            {selectedIds.size}
          </Text>
          <View style={styles.selectBarActions}>
            <IconActionButton
              plain
              icon={selectedList[0]?.pinned ? 'pin' : 'pin-outline'}
              label={selectedList[0]?.pinned ? 'Unpin message' : 'Pin message'}
              color={colors.link}
              iconSize={18}
              style={styles.selectBarClose}
              disabled={!canPinStar}
              onPress={() => void onPinSelected()}
            />
            <IconActionButton
              plain
              icon={selectedList[0]?.starred ? 'star' : 'star-outline'}
              label={selectedList[0]?.starred ? 'Unstar message' : 'Star message'}
              color={colors.link}
              iconSize={18}
              style={styles.selectBarClose}
              disabled={!canPinStar}
              onPress={() => void onStarSelected()}
            />
            <IconActionButton
              plain
              icon="arrow-undo"
              label="Reply"
              color={colors.link}
              iconSize={18}
              style={styles.selectBarClose}
              disabled={!canReply}
              onPress={onReplySelected}
            />
            <IconActionButton
              plain
              icon="happy-outline"
              label="React"
              tooltip="React"
              color={colors.link}
              iconSize={18}
              style={styles.selectBarClose}
              disabled={!canReply}
              onPress={onReactSelected}
            />
            <IconActionButton
              plain
              icon="share-social-outline"
              label="Share"
              tooltip="Share"
              color={colors.link}
              iconSize={18}
              style={styles.selectBarClose}
              disabled={!canReply}
              onPress={onSharePressSelected}
            />
            <IconActionButton
              plain
              icon="download-outline"
              label="Save to gallery"
              tooltip="Save"
              color={colors.link}
              iconSize={18}
              style={styles.selectBarClose}
              disabled={!canSaveToGallery}
              onPress={() => void onSaveSelectedToGallery()}
            />
            <IconActionButton
              plain
              icon="pencil-outline"
              label="Edit"
              color={colors.link}
              iconSize={18}
              style={styles.selectBarClose}
              disabled={!canEdit}
              onPress={onEditSelected}
            />
            <IconActionButton
              plain
              icon="information-circle-outline"
              label="Message info"
              tooltip="Info"
              color={colors.link}
              iconSize={18}
              style={styles.selectBarClose}
              disabled={!canShowInfo}
              onPress={onInfoSelected}
            />
            <IconActionButton
              plain
              icon="trash-outline"
              label="Delete selected"
              tooltip="Delete"
              danger
              iconSize={18}
              style={styles.selectBarClose}
              disabled={!allSelectedAreMine}
              onPress={() => void onDeleteSelected()}
            />
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

      {!selectMode && !searchActive && pinnedMessages.length > 0 ? (
        <View style={styles.pinnedBar}>
          <Pressable
            style={styles.pinnedBody}
            onPress={() => scrollToMessageId(pinnedMessages[pinnedCursor]?.id)}
            accessibilityRole="button"
            accessibilityLabel="Pinned message, tap to jump to it"
          >
            <AppIcon name="pin" size={14} color={colors.link} />
            <View style={styles.pinnedTextCol}>
              <Text style={styles.pinnedLabel} numberOfLines={1}>
                {pinnedMessages.length > 1
                  ? `Pinned message ${pinnedCursor + 1}/${pinnedMessages.length}`
                  : 'Pinned message'}
              </Text>
              <Text style={styles.pinnedPreview} numberOfLines={1}>
                {pinnedPreviewFor(pinnedMessages[pinnedCursor])}
              </Text>
            </View>
          </Pressable>
          {pinnedMessages.length > 1 ? (
            <Pressable
              style={styles.pinnedNextBtn}
              onPress={() => setPinnedCursor((c) => (c + 1) % pinnedMessages.length)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Show next pinned message"
            >
              <Text style={styles.pinnedNextGlyph}>›</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        style={{ flex: 1, minWidth: 0, opacity: listReady ? 1 : 0 }}
        contentContainerStyle={{ padding: 16 }}
        // Newest-first + inverted → latest sits at the bottom with no
        // scrollToEnd flash on open (big win on mid-range Android).
        inverted
        data={listDataNewestFirst}
        keyExtractor={(item) => item.id}
        onScroll={(e) => {
          // With inverted + newest-first, offset 0 is the visual bottom.
          stickToBottomRef.current = e.nativeEvent.contentOffset.y < 100;
        }}
        scrollEventThrottle={16}
        onContentSizeChange={() => {
          if (!stickToBottomRef.current) return;
          scrollToLatest(false);
        }}
        onEndReached={onLoadOlder}
        onEndReachedThreshold={0.3}
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
        // inverted flips footer to the visual top (older history side).
        ListFooterComponent={
          isLoadingOlder ? (
            <ActivityIndicator color={colors.chrome} style={{ marginVertical: 8 }} />
          ) : null
        }
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        renderItem={({ item }) => (
          // Every prop here is a primitive or an already-memoized value, so
          // the memoized bubble re-renders only when its own row changes —
          // not on every composer keystroke.
          <MessageBubble
            message={item}
            styles={styles}
            colors={colors}
            isMine={item.senderId === user?.id}
            isSelected={selectedIds.has(item.id)}
            isHighlighted={highlightId === item.id}
            selectMode={selectMode}
            pending={uploads[item.id]}
            onCancelPending={onCancelPendingMedia}
            avatarUri={avatarByUserId.get(item.senderId)}
            knownIgns={knownIgns}
            showSeen={item.senderId === user?.id && item.id === lastMineId}
            tickState={tickState}
            tickLabel={tickLabel}
            showAddMatch={latestPointsIds.has(item.id)}
            onPress={onPressMessage}
            onLongPress={onLongPressMessage}
            onOpenMedia={setViewerMedia}
            onToggleReaction={onToggleReaction}
            onShowInfo={setInfoMessageId}
            onAddMatch={onAddMatch}
          />
        )}
      />
      {!isConnected && (
        <Text style={styles.connecting}>
          {connectError ? `Connecting… (${connectError})` : 'Connecting…'}
        </Text>
      )}
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
      <PointsCalculatorModal
        // Remount on each open so a chat "Add match" seed never inherits
        // leftover matches from the last calculator session.
        key={
          pointsOpen
            ? pointsSeed
              ? `seed:${pointsSeed.title}:${pointsSeed.matches.map((m) => `${m.rank}-${m.kills}`).join(',')}`
              : 'open'
            : 'closed'
        }
        visible={pointsOpen}
        seed={pointsSeed}
        onClose={() => {
          setPointsOpen(false);
          setPointsSeed(null);
        }}
        // Same plain-text send path as a sticker/emoji message.
        onSendToChat={(text) => onPickStickerEmoji(text)}
      />
      <CameraPreviewModal
        uri={cameraShot?.asset.uri ?? null}
        isVideo={cameraShot?.option === 'video' || cameraShot?.option === 'record'}
        hideRetake={cameraShot?.option === 'record'}
        question={cameraShot?.option === 'record' ? 'Send this screen recording?' : undefined}
        onSend={() => {
          const shot = cameraShot;
          setCameraShot(null);
          if (shot) sendPickedAsset(shot.asset, shot.option);
        }}
        onRetake={() => {
          const option = cameraShot?.option ?? 'camera';
          setCameraShot(null);
          // Let the preview modal dismiss before reopening camera / gallery.
          setTimeout(() => void onPickMedia(option), 350);
        }}
        onCancel={() => setCameraShot(null)}
      />
      <ImageCropModal
        uri={cropShot?.asset.uri ?? null}
        width={cropShot?.asset.width}
        height={cropShot?.asset.height}
        onCancel={() => setCropShot(null)}
        onDone={onCropDone}
      />
      <ReminderComposer
        visible={reminderOpen}
        channelKey={channelKey}
        onClose={() => setReminderOpen(false)}
      />
      <ReactionPicker
        visible={!!reactionTarget}
        onClose={() => setReactionTarget(null)}
        onPick={(emoji) => {
          if (reactionTarget) onToggleReaction(reactionTarget.id, emoji);
        }}
      />
      <ShareClipSheet
        visible={shareClipOpen}
        onClose={() => {
          setShareClipOpen(false);
          setShareClipTarget(null);
        }}
        onShareOutside={() => void onShareOutside()}
        onForwardToChat={onForwardFromShareClip}
      />
      <ForwardSheet
        visible={!!forwardTarget}
        excludeChannelKey={channelKey}
        onClose={() => setForwardTarget(null)}
        onForward={onForwardSelected}
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
      <ChatStatusLine
        label={
          typingLabel([...typingUsers.values()]) ??
          (!isGroup ? presenceLabel(peerPresence) : null)
        }
      />
      <View style={styles.inputRow}>
        {voiceNoteActive && !editingId ? (
          <VoiceRecorderButton
            autoStart
            onCancel={() => setVoiceNoteActive(false)}
            onRecorded={(note) => {
              setVoiceNoteActive(false);
              const parent = replyTo;
              setReplyTo(null);
              startMediaSend(
                { uri: note.uri, fileName: note.fileName, mimeType: note.mimeType },
                'AUDIO',
                { replyTo: parent },
              );
            }}
          />
        ) : (
          <>
            <Pressable
              onPress={() => setShowAttach((v) => !v)}
              hitSlop={8}
              accessibilityLabel="Attach"
              style={styles.attachBtn}
              disabled={!!editingId}
            >
              <AppIcon
                name={showAttach ? 'close' : 'add-circle-outline'}
                size={28}
                color={colors.textMuted}
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
                    : 'Message'
              }
              placeholderTextColor={colors.textDim}
              value={draft}
              multiline
              onChangeText={(text) => {
                setDraft(text);
                setCaret(text.length);
                if (text.trim()) notifyTyping();
                else clearTypingNow();
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
              <AppIcon
                name={editingId ? 'checkmark-circle' : 'send'}
                size={24}
                color={colors.icon}
              />
            </Pressable>
          </>
        )}
      </View>

      <MediaViewerModal
        visible={!!viewerMedia}
        type={viewerMedia?.type ?? null}
        uri={viewerMedia?.uri ?? null}
        onClose={() => setViewerMedia(null)}
      />
      <MessageInfoModal
        visible={!!infoMessageId}
        pending={infoPending}
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

