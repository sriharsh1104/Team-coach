import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as chatApi from '../api/chat';
import * as liveApi from '../api/live';
import { ChatMessage } from '../api/types';
import { getToken } from '../storage/tokenStorage';
import { useLive } from './LiveContext';

type FloatingComment = {
  id: string;
  name: string;
  body: string;
  opacity: Animated.Value;
};

const COMMENT_TTL_MS = 5000;
const MAX_COMMENTS = 8;

function commentBody(m: ChatMessage): string | null {
  if (m.mediaType) return null;
  const text = (m.text ?? '').trim();
  if (!text) return null;
  // Keep overlay readable — one short line.
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

/**
 * On-stream HUD: title, optional banner, right-side chat that fades in 5s.
 * No opaque panels — text uses shadow so the rest of the screen stays usable
 * and screen-capture picks up the same overlay for viewers.
 */
export function LiveOverlay() {
  const { live, paused, title, bannerUri, youtubeLiveUrl } = useLive();
  const insets = useSafeAreaInsets();
  const [comments, setComments] = useState<FloatingComment[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const seenYtIdsRef = useRef<Set<string>>(new Set());

  const pushComment = useCallback((id: string, name: string, body: string) => {
    const opacity = new Animated.Value(0);
    const entry: FloatingComment = { id, name, body, opacity };
    setComments((prev) => {
      const next = [...prev, entry];
      return next.length > MAX_COMMENTS ? next.slice(-MAX_COMMENTS) : next;
    });
    Animated.timing(opacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 320,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;
        setComments((prev) => prev.filter((c) => c.id !== id));
        timersRef.current.delete(id);
      });
    }, COMMENT_TTL_MS);
    timersRef.current.set(id, timer);
  }, []);

  useEffect(() => {
    if (!live) {
      for (const t of timersRef.current.values()) clearTimeout(t);
      timersRef.current.clear();
      seenYtIdsRef.current.clear();
      setComments([]);
      return;
    }

    let cancelled = false;
    let socket: ReturnType<typeof chatApi.connectChatSocket> | null = null;
    const onConnect = () => {
      // Ensure rooms are joined so comments arrive even if Chat isn't open.
      // Do not leave on cleanup — ChatScreen may still be using the same socket.
      socket?.emit('channel:join', { channelKey: 'org' });
      socket?.emit('channel:join', { channelKey: 'guild' });
    };

    void (async () => {
      const token = await getToken();
      if (!token || cancelled) return;
      socket = chatApi.connectChatSocket(token);
      if (socket.connected) onConnect();
      else socket.on('connect', onConnect);
    })();

    const unsub = chatApi.subscribeChatMessages((message) => {
      if (cancelled) return;
      if (message.channelKey !== 'org' && message.channelKey !== 'guild') return;
      const body = commentBody(message);
      if (!body) return;
      const id = message.id || `${Date.now()}-${Math.random()}`;
      pushComment(id, message.senderName?.trim() || 'Member', body);
    });

    return () => {
      cancelled = true;
      unsub();
      for (const t of timersRef.current.values()) clearTimeout(t);
      timersRef.current.clear();
      socket?.off('connect', onConnect);
    };
  }, [live, pushComment]);

  // YouTube Live Chat (public) — optional; needs YOUTUBE_DATA_API_KEY + watch URL.
  useEffect(() => {
    if (!live || !youtubeLiveUrl?.trim()) return;

    let cancelled = false;
    let pageToken: string | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let primed = false;
    const seen = seenYtIdsRef.current;

    const poll = async () => {
      try {
        const page = await liveApi.fetchYoutubeLiveChat(
          youtubeLiveUrl.trim(),
          pageToken,
        );
        if (cancelled) return;
        pageToken = page.nextPageToken;
        for (const c of page.comments) {
          if (seen.has(c.id)) continue;
          seen.add(c.id);
          // Cap memory for long streams.
          if (seen.size > 400) {
            const drop = [...seen].slice(0, seen.size - 300);
            for (const id of drop) seen.delete(id);
          }
          // First page is history catch-up — don't flood the overlay.
          if (primed) {
            pushComment(`yt:${c.id}`, c.author, c.text);
          }
        }
        primed = true;
        const delay = page.pollingIntervalMs || 5000;
        timer = setTimeout(() => {
          void poll();
        }, delay);
      } catch {
        if (cancelled) return;
        // Soft-fail: Team/Guild chat still works; retry in a bit.
        timer = setTimeout(() => {
          void poll();
        }, 8000);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [live, youtubeLiveUrl, pushComment]);

  if (!live) return null;

  return (
    <View style={styles.root} pointerEvents="box-none">
      <View
        style={[styles.topBlock, { paddingTop: insets.top + 8 }]}
        pointerEvents="none"
      >
        {bannerUri ? (
          <Image
            source={{ uri: bannerUri }}
            style={styles.banner}
            resizeMode="cover"
            accessibilityLabel="Live banner"
          />
        ) : null}
        {title.trim() ? (
          <Text style={styles.title} numberOfLines={2}>
            {title.trim()}
          </Text>
        ) : null}
      </View>

      <View
        style={[styles.commentsCol, { bottom: insets.bottom + 88 }]}
        pointerEvents="none"
      >
        {comments.map((c) => (
          <Animated.View key={c.id} style={{ opacity: c.opacity }}>
            <Text style={styles.commentLine} numberOfLines={3}>
              <Text style={styles.commentName}>{c.name}</Text>
              <Text style={styles.commentSep}>: </Text>
              <Text style={styles.commentBody}>{c.body}</Text>
            </Text>
          </Animated.View>
        ))}
      </View>

      {paused ? (
        <View style={styles.pausedWrap} pointerEvents="none">
          <Text style={styles.pausedLabel}>PAUSED</Text>
        </View>
      ) : null}
    </View>
  );
}

const TEXT_SHADOW = {
  textShadowColor: 'rgba(0,0,0,0.85)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 4,
};

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9997,
  },
  topBlock: {
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  banner: {
    width: '92%',
    maxWidth: 420,
    height: 56,
    borderRadius: 8,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    ...TEXT_SHADOW,
  },
  commentsCol: {
    position: 'absolute',
    right: 10,
    left: '42%',
    gap: 6,
    alignItems: 'flex-end',
  },
  commentLine: {
    textAlign: 'right',
    maxWidth: '100%',
    ...TEXT_SHADOW,
  },
  commentName: {
    color: '#a8b0ff',
    fontWeight: '800',
    fontSize: 13,
  },
  commentSep: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  commentBody: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  pausedWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pausedLabel: {
    color: '#fff',
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: 4,
    ...TEXT_SHADOW,
  },
});
