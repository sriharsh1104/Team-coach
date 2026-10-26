import { io, Socket } from 'socket.io-client';
import { apiClient, apiBaseUrl } from './client';
import { ChatMessage } from './types';

export function getChatHistory() {
  return apiClient
    .get<ChatMessage[]>('/chat/messages')
    .then((res) => res.data);
}

export function connectChatSocket(token: string): Socket {
  return io(apiBaseUrl, {
    auth: { token },
    transports: ['websocket'],
  });
}
