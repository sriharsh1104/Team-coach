import { io, Socket } from 'socket.io-client';
import { apiClient, apiBaseUrl } from './client';
import { ChatChannelsResponse, ChatMessage } from './types';

export function getChatChannels() {
  return apiClient
    .get<ChatChannelsResponse>('/chat/channels')
    .then((res) => res.data);
}

export function getChatHistory(channelKey = 'org') {
  return apiClient
    .get<ChatMessage[]>('/chat/messages', { params: { channelKey } })
    .then((res) => res.data);
}

export function markChatRead(channelKey = 'org') {
  return apiClient
    .post<{ channelKey: string; unreadCount: number }>('/chat/read', {
      channelKey,
    })
    .then((res) => res.data);
}

export function getUnreadSummary() {
  return apiClient
    .get<{ totalUnread: number }>('/chat/unread')
    .then((res) => res.data);
}

export async function uploadChatMedia(file: {
  uri: string;
  fileName: string;
  mimeType: string;
}) {
  const form = new FormData();
  form.append('file', {
    uri: file.uri,
    name: file.fileName,
    type: file.mimeType,
  } as any);
  const res = await apiClient.post<{
    mediaUrl: string;
    mediaType: 'IMAGE' | 'VIDEO';
  }>('/chat/media', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export function connectChatSocket(token: string): Socket {
  return io(apiBaseUrl, {
    auth: { token },
    transports: ['websocket'],
  });
}

export function resolveChatMediaUrl(mediaUrl: string | null | undefined) {
  if (!mediaUrl) return null;
  if (mediaUrl.startsWith('http')) return mediaUrl;
  return `${apiBaseUrl}${mediaUrl}`;
}
