import { io, Socket } from 'socket.io-client';
import { apiBaseUrl, apiClient, resolveMediaUrl } from './client';
import { ChatChannelsResponse, ChatMessage } from './types';

export const CHAT_HISTORY_PAGE_SIZE = 50;

export function getChatChannels() {
  return apiClient
    .get<ChatChannelsResponse>('/chat/channels')
    .then((res) => res.data);
}

export function getChatHistory(channelKey = 'org', before?: string) {
  return apiClient
    .get<ChatMessage[]>('/chat/messages', { params: { channelKey, before } })
    .then((res) => res.data);
}

export function searchChatMessages(
  channelKey = 'org',
  q: string,
  before?: string,
) {
  return apiClient
    .get<ChatMessage[]>('/chat/search', { params: { channelKey, q, before } })
    .then((res) => res.data);
}

export function markChatRead(channelKey = 'org') {
  return apiClient
    .post<{ channelKey: string; unreadCount: number }>('/chat/read', {
      channelKey,
    })
    .then((res) => res.data);
}

export function connectChatSocket(token: string): Socket {
  return io(apiBaseUrl, {
    auth: { token },
    transports: ['websocket'],
  });
}

export { resolveMediaUrl };
