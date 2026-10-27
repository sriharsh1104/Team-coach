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
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Socket } from 'socket.io-client';
import { TOKEN_STORAGE_KEY } from '../../api/client';
import * as chatApi from '../../api/chat';
import { ChatMessage } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { sharedStyles } from '../shared';

export function ChatScreen() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const history = await chatApi.getChatHistory();
      if (cancelled) return;
      setMessages(history);

      const token = await SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
      if (!token || cancelled) return;

      const socket = chatApi.connectChatSocket(token);
      socketRef.current = socket;

      socket.on('connect', () => setIsConnected(true));
      socket.on('disconnect', () => setIsConnected(false));
      socket.on('message:new', (message: ChatMessage) => {
        setMessages((prev) => [...prev, message]);
      });
    })();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  const onSend = useCallback(() => {
    const text = draft.trim();
    if (!text || !socketRef.current) return;
    socketRef.current.emit('message:send', { text });
    setDraft('');
  }, [draft]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#fff' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FlatList
        ref={listRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16 }}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isMine = item.senderId === user?.id;
          return (
            <View
              style={[
                styles.bubbleRow,
                isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs,
              ]}
            >
              <View style={[styles.bubble, isMine && styles.bubbleMine]}>
                {!isMine && <Text style={styles.sender}>{item.senderName}</Text>}
                <Text style={isMine ? styles.textMine : styles.text}>
                  {item.text}
                </Text>
              </View>
            </View>
          );
        }}
      />
      {!isConnected && (
        <Text style={styles.connecting}>Connecting…</Text>
      )}
      <View style={styles.inputRow}>
        <TextInput
          style={[sharedStyles.input, { flex: 1, marginBottom: 0 }]}
          placeholder="Message your team…"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={onSend}
        />
        <Pressable
          style={[sharedStyles.button, !draft.trim() && sharedStyles.buttonDisabled]}
          disabled={!draft.trim()}
          onPress={onSend}
        >
          <Text style={sharedStyles.buttonText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bubbleRow: { flexDirection: 'row', marginBottom: 10 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowTheirs: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '80%',
    backgroundColor: '#f1f1f1',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleMine: { backgroundColor: '#111' },
  sender: { fontSize: 11, color: '#888', marginBottom: 2 },
  text: { color: '#111' },
  textMine: { color: '#fff' },
  connecting: { textAlign: 'center', color: '#888', paddingBottom: 4 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    paddingTop: 0,
  },
});
