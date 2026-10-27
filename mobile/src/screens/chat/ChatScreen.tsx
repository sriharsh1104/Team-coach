import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  Linking,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Socket } from 'socket.io-client';
import { getToken } from '../../storage/tokenStorage';
import * as chatApi from '../../api/chat';
import { ChatMessage } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Screen } from '../../brand/Screen';
import { sharedStyles } from '../shared';
import { EmojiBar } from './EmojiBar';
import { colors } from '../../theme';

// "Teammate · Coach" / "Owner Coach · Coach (Owner)" — role badge is shown
// next to the name for everyone but yourself (you already know your own role).
function formatSenderLabel(message: ChatMessage): string {
  if (!message.senderRole) return message.senderName;
  const role =
    message.senderRole.charAt(0) + message.senderRole.slice(1).toLowerCase();
  return `${message.senderName} · ${role}${message.senderIsOwner ? ' (Owner)' : ''}`;
}

export function ChatScreen({
  embedded = false,
  channelKey = 'org',
}: {
  embedded?: boolean;
  channelKey?: string;
} = {}) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const history = await chatApi.getChatHistory(channelKey);
      if (cancelled) return;
      setMessages(history);
      await chatApi.markChatRead(channelKey).catch(() => undefined);

      const token = await getToken();
      if (!token || cancelled) return;

      const socket = chatApi.connectChatSocket(token);
      socketRef.current = socket;

      socket.on('connect', () => {
        setIsConnected(true);
        socket.emit('channel:join', { channelKey });
      });
      socket.on('disconnect', () => setIsConnected(false));
      socket.on('message:new', (message: ChatMessage) => {
        if (message.channelKey && message.channelKey !== channelKey) return;
        setMessages((prev) => {
          if (prev.some((m) => m.id === message.id)) return prev;
          return [...prev, message];
        });
        void chatApi.markChatRead(channelKey);
      });
    })();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
    };
  }, [channelKey]);

  useEffect(() => {
    if (messages.length > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

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
    setShowEmoji(false);
  }, [draft, emitMessage]);

  const onPickMedia = async (fromCamera: boolean) => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow camera / gallery access to share media.');
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.All,
          quality: 0.8,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.All,
          quality: 0.8,
        });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    try {
      const uploaded = await chatApi.uploadChatMedia({
        uri: asset.uri,
        fileName: asset.fileName ?? `chat-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
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
      <FlatList
        ref={listRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16 }}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isMine = item.senderId === user?.id;
          const mediaUri = chatApi.resolveChatMediaUrl(item.mediaUrl);
          return (
            <View
              style={[
                styles.bubbleRow,
                isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs,
              ]}
            >
              <View style={[styles.bubble, isMine && styles.bubbleMine]}>
                {!isMine && (
                  <Text style={styles.sender}>{formatSenderLabel(item)}</Text>
                )}
                {item.mediaType === 'IMAGE' && mediaUri ? (
                  <Image source={{ uri: mediaUri }} style={styles.media} />
                ) : null}
                {item.mediaType === 'VIDEO' && mediaUri ? (
                  <Pressable onPress={() => Linking.openURL(mediaUri)}>
                    <Text style={isMine ? styles.textMine : styles.link}>
                      🎬 Open Video
                    </Text>
                  </Pressable>
                ) : null}
                {item.text ? (
                  <Text style={isMine ? styles.textMine : styles.text}>
                    {item.text}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        }}
      />
      {!isConnected && <Text style={styles.connecting}>Connecting…</Text>}
      {showEmoji && (
        <EmojiBar onPick={(emoji) => setDraft((prev) => prev + emoji)} />
      )}
      <View style={styles.toolbar}>
        <Pressable onPress={() => setShowEmoji((v) => !v)} hitSlop={8}>
          <Text style={styles.toolIcon}>☺</Text>
        </Pressable>
        <Pressable onPress={() => onPickMedia(false)} hitSlop={8}>
          <Text style={styles.toolIcon}>🖼</Text>
        </Pressable>
        <Pressable onPress={() => onPickMedia(true)} hitSlop={8}>
          <Text style={styles.toolIcon}>📷</Text>
        </Pressable>
      </View>
      <View style={styles.inputRow}>
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
    </KeyboardAvoidingView>
  );

  if (embedded) return body;
  return <Screen>{body}</Screen>;
}

const styles = StyleSheet.create({
  bubbleRow: { flexDirection: 'row', marginBottom: 10 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowTheirs: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '80%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleMine: { backgroundColor: '#c9ccd1' },
  sender: { fontSize: 11, color: '#9aa0a6', marginBottom: 2 },
  text: { color: '#f2f3f5' },
  textMine: { color: '#0a0a0c' },
  link: { color: colors.link, fontWeight: '600' },
  media: { width: 200, height: 160, borderRadius: 8, marginBottom: 6 },
  connecting: { textAlign: 'center', color: '#9aa0a6', paddingBottom: 4 },
  toolbar: {
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  toolIcon: { fontSize: 22, color: colors.text },
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
