import { io, Socket } from 'socket.io-client';
import { apiClient, apiBaseUrl, resolveMediaUrl } from './client';
import { ChatChannelsResponse, ChatMessage } from './types';
import { appendFileToFormData } from './uploadFile';
import { compressForUpload } from '../media/compressForUpload';

export function getChatChannels() {
  return apiClient
    .get<ChatChannelsResponse>('/chat/channels')
    .then((res) => res.data);
}

// `before` is the oldest currently-loaded message's id — pass it to fetch
// the next (older) page. A returned page shorter than CHAT_HISTORY_PAGE_SIZE
// means there's nothing older left.
export const CHAT_HISTORY_PAGE_SIZE = 50;

export function getChatHistory(channelKey = 'org', before?: string) {
  return apiClient
    .get<ChatMessage[]>('/chat/messages', { params: { channelKey, before } })
    .then((res) => res.data);
}

/** Debounce on the client; empty `q` returns [] from the API. */
export function searchChatMessages(
  channelKey = 'org',
  q: string,
  before?: string,
) {
  return apiClient
    .get<ChatMessage[]>('/chat/search', {
      params: { channelKey, q, before },
    })
    .then((res) => res.data);
}

export function getChatMedia(channelKey = 'org', before?: string) {
  return apiClient
    .get<ChatMessage[]>('/chat/media', { params: { channelKey, before } })
    .then((res) => res.data);
}

export function getChatLinks(channelKey = 'org', before?: string) {
  return apiClient
    .get<ChatMessage[]>('/chat/links', { params: { channelKey, before } })
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
  width?: number | null;
  height?: number | null;
}) {
  const prepared = await compressForUpload(file);
  const form = new FormData();
  await appendFileToFormData(form, {
    uri: prepared.uri,
    name: prepared.fileName,
    type: prepared.mimeType,
  });
  const res = await apiClient.post<{
    mediaUrl: string;
    mediaType: 'IMAGE' | 'VIDEO';
    fileKey: string;
    mediaPostId: string | null;
  }>('/chat/media', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

/** Pull the disk file key out of a chat media URL path. */
export function fileKeyFromChatMediaUrl(mediaUrl: string | null | undefined) {
  if (!mediaUrl) return null;
  const match = mediaUrl.match(/\/chat\/files\/([^?]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function connectChatSocket(token: string): Socket {
  return io(apiBaseUrl, {
    auth: { token },
    transports: ['websocket'],
  });
}

export function resolveChatMediaUrl(mediaUrl: string | null | undefined) {
  return resolveMediaUrl(mediaUrl);
}
