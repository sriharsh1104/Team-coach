import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import * as chatApi from '../api/chat';
import { TOKEN_STORAGE_KEY } from '../api/client';
import { ChatChannel, ChatMessage, ChatTeammate } from '../api/types';
import { useAuth } from '../auth/AuthContext';

const SEARCH_DEBOUNCE_MS = 300;

export function ChatPage() {
  const { user, org } = useAuth();
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [teammates, setTeammates] = useState<ChatTeammate[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [connected, setConnected] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [matchIds, setMatchIds] = useState<string[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  const active = useMemo(
    () => channels.find((c) => c.channelKey === activeKey) ?? null,
    [channels, activeKey],
  );

  useEffect(() => {
    chatApi.getChatChannels().then((data) => {
      setChannels(data.channels);
      setTeammates(data.teammates);
    });
  }, []);

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
  }

  function onSend(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !socketRef.current || !activeKey) return;
    socketRef.current.emit('message:send', { channelKey: activeKey, text });
    setDraft('');
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
          <h1>{org?.name ?? 'Team Chat'}</h1>
          <p>Web client · same Nest API as mobile</p>
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
                      <span>Direct message</span>
                    </div>
                  </button>
                ))
              )}
            </div>
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
                        {m.text}
                      </div>
                    );
                  })}
                </div>

                <form className="composer" onSubmit={onSend}>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Message…"
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
