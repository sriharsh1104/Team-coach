import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Socket } from 'socket.io-client';
import * as chatApi from '../api/chat';
import { TOKEN_STORAGE_KEY } from '../api/client';
import { ChatChannel, ChatMessage, ChatTeammate } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import {
  CHAT_EMOJIS,
  activeMentionQuery,
  filterMentionables,
  insertMention,
  splitMentionParts,
  type MentionCandidate,
} from '../lib/chatMentions';

const SEARCH_DEBOUNCE_MS = 300;

function MessageBody({
  text,
  knownIgns,
}: {
  text: string | null;
  knownIgns: string[];
}) {
  if (!text) return null;
  const parts = splitMentionParts(text, knownIgns);
  return (
    <>
      {parts.map((p, i) =>
        p.type === 'mention' ? (
          <span key={i} className="chat-mention">
            {p.value}
          </span>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </>
  );
}

export function ChatPage({ variant = 'roster' }: { variant?: 'roster' | 'guild' }) {
  const { user, org, guild } = useAuth();
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [teammates, setTeammates] = useState<ChatTeammate[]>([]);
  const [mentionables, setMentionables] = useState<ChatTeammate[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [caret, setCaret] = useState(0);
  const [showEmoji, setShowEmoji] = useState(false);
  const [connected, setConnected] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [matchIds, setMatchIds] = useState<string[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  const active = useMemo(
    () => channels.find((c) => c.channelKey === activeKey) ?? null,
    [channels, activeKey],
  );

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
    setMentionIndex(0);
  }, [mentionState?.query, mentionState?.start]);

  useEffect(() => {
    if (variant === 'guild') {
      setChannels([
        {
          channelKey: 'guild',
          type: 'ORG',
          title: 'Guild Chat',
          peerUserId: null,
          peerAvatarUrl: null,
          memberCount: null,
          unreadCount: 0,
          lastMessageAt: null,
          lastPreview: null,
        },
      ]);
      setTeammates([]);
      setActiveKey('guild');
      chatApi.getChatChannels().then((data) => {
        setMentionables(data.mentionables ?? data.teammates ?? []);
      }).catch(() => setMentionables([]));
      return;
    }
    chatApi.getChatChannels().then((data) => {
      setChannels(data.channels);
      setTeammates(data.teammates);
      setMentionables(data.mentionables ?? data.teammates ?? []);
    });
  }, [variant]);

  useEffect(() => {
    if (!activeKey) return;
    let cancelled = false;
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) return;

    (async () => {
      const history = await chatApi.getChatHistory(activeKey);
      if (cancelled) return;
      setMessages(history);
      await chatApi.markChatRead(activeKey).catch(() => undefined);

      socketRef.current?.disconnect();
      const socket = chatApi.connectChatSocket(token);
      socketRef.current = socket;
      socket.on('connect', () => {
        setConnected(true);
        socket.emit('channel:join', { channelKey: activeKey });
        socket.emit('channel:delivered', { channelKey: activeKey });
        socket.emit('channel:read', { channelKey: activeKey });
      });
      socket.on('disconnect', () => setConnected(false));
      socket.on('message:new', (message: ChatMessage) => {
        if (message.channelKey && message.channelKey !== activeKey) return;
        setMessages((prev) =>
          prev.some((m) => m.id === message.id) ? prev : [...prev, message],
        );
        void chatApi.markChatRead(activeKey);
        socket.emit('channel:read', { channelKey: activeKey });
      });
    })();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [activeKey]);

  useEffect(() => {
    if (!searchOpen) {
      setSearchDraft('');
      setSearchQuery('');
      setMatchIds([]);
      setHighlightId(null);
      return;
    }
    const t = setTimeout(() => setSearchQuery(searchDraft.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchDraft, searchOpen]);

  useEffect(() => {
    if (!activeKey || !searchQuery) {
      setMatchIds([]);
      setHighlightId(null);
      return;
    }
    let cancelled = false;
    chatApi.searchChatMessages(activeKey, searchQuery).then((hits) => {
      if (cancelled) return;
      const ids = hits.map((h) => h.id);
      setMatchIds(ids);
      setMatchIndex(0);
      const first = ids[0];
      if (first) {
        setHighlightId(first);
        requestAnimationFrame(() => {
          document
            .getElementById(`msg-${first}`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [searchQuery, activeKey]);

  useEffect(() => {
    if (searchQuery) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length, searchQuery]);

  function openChannel(channelKey: string) {
    setActiveKey(channelKey);
    setSearchOpen(false);
    setShowEmoji(false);
  }

  function syncCaret() {
    const el = inputRef.current;
    if (el) setCaret(el.selectionStart ?? el.value.length);
  }

  function applyDraft(next: string, nextCaret: number) {
    setDraft(next);
    setCaret(nextCaret);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(nextCaret, nextCaret);
    });
  }

  function pickEmoji(emoji: string) {
    const el = inputRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    applyDraft(next, start + emoji.length);
  }

  function pickMention(mate: MentionCandidate) {
    if (!mentionState || !mate.inGameName) return;
    const { text, caret: nextCaret } = insertMention(
      draft,
      caret,
      mentionState.start,
      mate.inGameName,
    );
    applyDraft(text, nextCaret);
  }

  function onSend(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !socketRef.current || !activeKey) return;
    socketRef.current.emit('message:send', { channelKey: activeKey, text });
    setDraft('');
    setCaret(0);
    setShowEmoji(false);
  }

  function onComposerKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (mentionSuggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMentionIndex((i) => (i + 1) % mentionSuggestions.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMentionIndex(
        (i) => (i - 1 + mentionSuggestions.length) % mentionSuggestions.length,
      );
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      const pick = mentionSuggestions[mentionIndex];
      if (pick) {
        e.preventDefault();
        pickMention(pick);
      }
    }
    if (e.key === 'Escape') {
      setCaret(draft.length);
    }
  }

  function goMatch(delta: number) {
    if (matchIds.length === 0) return;
    const next =
      ((matchIndex + delta) % matchIds.length + matchIds.length) %
      matchIds.length;
    setMatchIndex(next);
    const id = matchIds[next];
    setHighlightId(id);
    document
      .getElementById(`msg-${id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>
            {variant === 'guild'
              ? (guild?.name ?? 'Guild Chat')
              : (org?.name ?? 'Team Chat')}
          </h1>
          <p>{variant === 'guild' ? 'Guild chat' : 'Team chat'}</p>
        </div>
        {!connected && activeKey ? (
          <span className="muted">Connecting…</span>
        ) : null}
      </div>
      <div className="content flush">
        <div className="chat-layout">
          <div className="chat-inbox">
            <h2>Chats</h2>
            <div className="list">
              {channels.map((ch) => (
                <button
                  key={ch.channelKey}
                  type="button"
                  className="list-row"
                  onClick={() => openChannel(ch.channelKey)}
                >
                  <div>
                    <strong>{ch.title}</strong>
                    <span>{ch.lastPreview ?? 'No messages yet'}</span>
                  </div>
                  {ch.unreadCount > 0 ? (
                    <span className="badge">{ch.unreadCount}</span>
                  ) : null}
                </button>
              ))}
            </div>
            {variant === 'roster' ? (
              <>
                <h2 style={{ marginTop: 18 }}>Direct</h2>
                <div className="list">
                  {teammates.length === 0 ? (
                    <p className="muted">No teammates yet.</p>
                  ) : (
                    teammates.map((t) => (
                      <button
                        key={t.userId}
                        type="button"
                        className="list-row"
                        onClick={() => openChannel(t.channelKey)}
                      >
                        <div>
                          <strong>{t.name}</strong>
                          <span>
                            {t.inGameName
                              ? `@${t.inGameName}`
                              : 'Direct message'}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </>
            ) : null}
          </div>

          <div className="chat-thread">
            {!activeKey || !active ? (
              <div className="content">
                <p className="muted">Select a chat to start messaging.</p>
              </div>
            ) : (
              <>
                <div className="chat-thread-header">
                  <button
                    type="button"
                    className="btn btn-icon"
                    onClick={() => setActiveKey(null)}
                    aria-label="Back"
                  >
                    ←
                  </button>
                  <h2>{active.title}</h2>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setSearchOpen((v) => !v)}
                    aria-label="Search chat"
                  >
                    ⌕
                  </button>
                </div>

                {searchOpen ? (
                  <div className="search-inline">
                    <input
                      value={searchDraft}
                      onChange={(e) => setSearchDraft(e.target.value)}
                      placeholder="Search in chat"
                      aria-label="Search in chat"
                    />
                    <span>
                      {searchQuery
                        ? matchIds.length
                          ? `${matchIndex + 1}/${matchIds.length}`
                          : '0'
                        : ''}
                    </span>
                    <button
                      type="button"
                      className="btn btn-icon"
                      onClick={() => goMatch(-1)}
                      disabled={matchIds.length < 2}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn-icon"
                      onClick={() => goMatch(1)}
                      disabled={matchIds.length < 2}
                    >
                      ↓
                    </button>
                  </div>
                ) : null}

                <div className="messages" ref={listRef}>
                  {messages.map((m) => {
                    const mine = m.senderId === user?.id;
                    return (
                      <div
                        key={m.id}
                        id={`msg-${m.id}`}
                        className={`bubble${mine ? ' mine' : ''}${
                          highlightId === m.id ? ' hit' : ''
                        }`}
                      >
                        {!mine ? (
                          <div className="sender">{m.senderName}</div>
                        ) : null}
                        <MessageBody text={m.text} knownIgns={knownIgns} />
                      </div>
                    );
                  })}
                </div>

                {showEmoji ? (
                  <div className="emoji-bar" role="listbox" aria-label="Emoji">
                    {CHAT_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="emoji-bar-btn"
                        onClick={() => pickEmoji(emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                    <span className="emoji-bar-hint muted">
                      Or type / paste any emoji
                    </span>
                  </div>
                ) : null}

                {mentionSuggestions.length > 0 ? (
                  <div className="mention-menu" role="listbox" aria-label="Mention">
                    {mentionSuggestions.map((mate, i) => (
                      <button
                        key={mate.userId}
                        type="button"
                        className={`mention-option${
                          i === mentionIndex ? ' active' : ''
                        }`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pickMention(mate);
                        }}
                      >
                        <strong>@{mate.inGameName}</strong>
                        <span>{mate.name}</span>
                      </button>
                    ))}
                  </div>
                ) : null}

                <form className="composer" onSubmit={onSend}>
                  <button
                    type="button"
                    className="btn btn-icon composer-emoji-toggle"
                    onClick={() => setShowEmoji((v) => !v)}
                    aria-label="Emoji"
                    aria-pressed={showEmoji}
                  >
                    😊
                  </button>
                  <input
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      setCaret(e.target.selectionStart ?? e.target.value.length);
                    }}
                    onClick={syncCaret}
                    onKeyUp={syncCaret}
                    onSelect={syncCaret}
                    onKeyDown={onComposerKeyDown}
                    placeholder="Message… use @IGN to mention"
                    aria-label="Message"
                  />
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={!draft.trim()}
                  >
                    Send
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
