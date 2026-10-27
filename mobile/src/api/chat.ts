import { io, Socket } from 'socket.io-client';
import { apiClient, apiBaseUrl } from './client';
import { ChatChannelsResponse, ChatMessage } from './types';
import { appendFileToFormData } from './uploadFile';

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

export interface ReadReceipt {
  userId: string;
  name: string;
  lastReadAt: string;
}

export function getReadReceipts(channelKey = 'org') {
  return apiClient
    .get<ReadReceipt[]>('/chat/read-receipts', { params: { channelKey } })
    .then((res) => res.data);
}

export interface DeliveryReceipt {
  userId: string;
  name: string;
  lastDeliveredAt: string;
}

export function getDeliveryReceipts(channelKey = 'org') {
  return apiClient
    .get<DeliveryReceipt[]>('/chat/delivery-receipts', { params: { channelKey } })
    .then((res) => res.data);
}

export async function uploadChatMedia(file: {
  uri: string;
  fileName: string;
  mimeType: string;
}) {
  const form = new FormData();
  await appendFileToFormData(form, {
    uri: file.uri,
    name: file.fileName,
    type: file.mimeType,
  });
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
