import axios from 'axios';
import { AppState, AppStateStatus } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { apiClient, apiBaseUrl, resolveMediaUrl } from './client';
import { ChatChannelsResponse, ChatMessage, LinkPreview } from './types';
import { appendFileToFormData } from './uploadFile';
import { compressForUpload } from '../media/compressForUpload';

export function getChatChannels() {
  return apiClient
    .get<ChatChannelsResponse>('/chat/channels', {
      // Guild-only seats used to 404 here; ChatScreen already falls back to
      // empty mentionables — don't spam the global toaster on that path.
      skipErrorToast: true,
    } as Record<string, unknown>)
    .then((res) => res.data);
}

// `before` is the oldest currently-loaded message's id — pass it to fetch
// the next (older) page. A returned page shorter than CHAT_HISTORY_PAGE_SIZE
// means there's nothing older left.
export const CHAT_HISTORY_PAGE_SIZE = 50;

export function getChatHistory(
  channelKey = 'org',
  before?: string,
  opts?: { starredOnly?: boolean },
) {
  return apiClient
    .get<ChatMessage[]>('/chat/messages', {
      params: {
        channelKey,
        before,
        ...(opts?.starredOnly ? { starred: '1' } : {}),
      },
    })
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

/** Delete the caller's own messages (WhatsApp "delete for everyone"). */
export function deleteMessages(ids: string[]) {
  return apiClient
    .post<{ deleted: Array<{ id: string; channelKey: string; orgId: string }> }>(
      '/chat/messages/delete',
      { ids },
    )
    .then((res) => res.data);
}

/** REST send — used by the notification Reply action (socket may be down). */
export function sendChatMessage(input: {
  channelKey: string;
  text: string;
  replyToId?: string;
}) {
  return apiClient
    .post<{ ok: boolean; id: string }>('/chat/messages', {
      channelKey: input.channelKey,
      text: input.text,
      replyToId: input.replyToId,
    })
    .then((res) => res.data);
}

export function editMessage(id: string, text: string) {
  return apiClient
    .post<{ channelKey: string; message: ChatMessage }>('/chat/messages/edit', {
      id,
      text,
    })
    .then((res) => res.data);
}

export function setChannelMuted(channelKey: string, muted: boolean) {
  return apiClient
    .post<{ channelKey: string; muted: boolean }>('/chat/mute', {
      channelKey,
      muted,
    })
    .then((res) => res.data);
}

export function createChatReminder(input: {
  channelKey: string;
  message: string;
  fireAt: string;
}) {
  return apiClient
    .post<{
      id: string;
      channelKey: string;
      message: string;
      fireAt: string;
    }>('/chat/reminders', input)
    .then((res) => res.data);
}

export function clearChat(channelKey: string) {
  return apiClient
    .post<{ channelKey: string; clearedAt: string }>('/chat/clear', {
      channelKey,
    })
    .then((res) => res.data);
}

export function setMessagePinned(
  channelKey: string,
  messageId: string,
  pinned: boolean,
) {
  return apiClient
    .post<{ channelKey: string; messageId: string; pinned: boolean }>(
      '/chat/pin',
      { channelKey, messageId, pinned },
    )
    .then((res) => res.data);
}

export function listPinnedMessages(channelKey: string) {
  return apiClient
    .get<ChatMessage[]>('/chat/pins', { params: { channelKey } })
    .then((res) => res.data);
}

export function setMessageStarred(
  channelKey: string,
  messageId: string,
  starred: boolean,
) {
  return apiClient
    .post<{ messageId: string; starred: boolean }>('/chat/star', {
      channelKey,
      messageId,
      starred,
    })
    .then((res) => res.data);
}

export function getChannelMeta(channelKey: string) {
  return apiClient
    .get<import('./types').ChatChannelMeta>('/chat/meta', {
      params: { channelKey },
    })
    .then((res) => res.data);
}

export function updateChannelMeta(
  channelKey: string,
  patch: {
    description?: string | null;
    disappearAfterSec?: number | null;
  },
) {
  return apiClient
    .post<import('./types').ChatChannelMeta>('/chat/meta', {
      channelKey,
      ...patch,
    })
    .then((res) => res.data);
}

export async function uploadChannelAvatar(channelKey: string, file: {
  uri: string;
  fileName: string;
  mimeType: string;
}) {
  // Android gallery often returns content:// — must materialize to file://
  // before FormData or the backend receives an empty upload.
  const prepared = await compressForUpload(file);
  const form = new FormData();
  await appendFileToFormData(form, {
    uri: prepared.uri,
    name: prepared.fileName,
    type: prepared.mimeType,
  });
  form.append('channelKey', channelKey);
  return apiClient
    .post<import('./types').ChatChannelMeta>('/chat/meta/avatar', form, {
      timeout: 60_000,
      transformRequest: stripMultipartContentType,
    })
    .then((res) => res.data);
}

export function getUnreadSummary() {
  return apiClient
    .get<{ totalUnread: number }>('/chat/unread')
    .then((res) => res.data);
}

// First http(s) link in a message — drives whether a preview card renders.
// Deliberately simple (no full RFC-3986 URL grammar): good enough for
// "someone pasted a link in chat" without pulling in a regex library.
const FIRST_URL_RE = /https?:\/\/[^\s<>"')\]]+/i;

export function extractFirstUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  return text.match(FIRST_URL_RE)?.[0] ?? null;
}

// Session-lived cache — the same shared link in a busy group chat shouldn't
// hit the network (and the backend's own fetch) more than once per screen.
const linkPreviewCache = new Map<string, Promise<LinkPreview | null>>();

export function getLinkPreview(url: string): Promise<LinkPreview | null> {
  const cached = linkPreviewCache.get(url);
  if (cached) return cached;
  const promise = apiClient
    .get<LinkPreview>('/chat/link-preview', {
      params: { url },
      skipErrorToast: true,
      timeout: 8000,
    } as Record<string, unknown>)
    .then((res) => res.data)
    .catch(() => null); // no card is a fine fallback — never blocks the bubble
  linkPreviewCache.set(url, promise);
  return promise;
}

export type ReadReceipt = {
  userId: string;
  name: string;
  lastReadAt: string;
};

export type DeliveryReceipt = {
  userId: string;
  name: string;
  lastDeliveredAt: string;
};

export function getReadReceipts(channelKey = 'org') {
  return apiClient
    .get<ReadReceipt[]>('/chat/read-receipts', { params: { channelKey } })
    .then((res) => res.data);
}

export function getDeliveryReceipts(channelKey = 'org') {
  return apiClient
    .get<DeliveryReceipt[]>('/chat/delivery-receipts', { params: { channelKey } })
    .then((res) => res.data);
}

type CloudinarySign =
  | { enabled: false }
  | {
      enabled: true;
      cloudName: string;
      apiKey: string;
      timestamp: number;
      signature: string;
      folder: string;
      publicId: string;
      resourceType: 'image' | 'video';
      type: 'authenticated';
      uploadUrl: string;
    };

type ChatMediaUploadResult = {
  mediaUrl: string;
  mediaType: 'IMAGE' | 'VIDEO';
  fileKey: string;
  mediaPostId: string | null;
};

function stripMultipartContentType(data: unknown, headers?: unknown) {
  if (headers && typeof headers === 'object') {
    delete (headers as Record<string, unknown>)['Content-Type'];
    delete (headers as Record<string, unknown>)['content-type'];
  }
  return data;
}

/**
 * WhatsApp-style pipeline:
 * 1) Compress on device
 * 2) Prefer direct Cloudinary upload (CDN holds bytes — API never buffers)
 * 3) Fall back to POST /chat/media through our backend when Cloudinary is off
 */
export type UploadProgress = {
  /** 'preparing' = compressing on device, 'uploading' = bytes in flight, 'finalizing' = registering with the API. */
  phase: 'preparing' | 'uploading' | 'finalizing';
  /** 0..1 overall, monotonic. */
  fraction: number;
};

type UploadOptions = { onProgress?: (p: UploadProgress) => void };

function uploadFraction(evt: { loaded: number; total?: number }): number {
  if (!evt.total || evt.total <= 0) return 0;
  return Math.min(1, evt.loaded / evt.total);
}

export async function uploadChatMedia(
  file: {
    uri: string;
    fileName: string;
    mimeType: string;
    width?: number | null;
    height?: number | null;
  },
  options: UploadOptions = {},
): Promise<ChatMediaUploadResult> {
  const report = (phase: UploadProgress['phase'], fraction: number) =>
    options.onProgress?.({ phase, fraction });

  report('preparing', 0);
  // Compression is only an optimisation — if it throws or hangs, send the
  // original file instead of blocking the message.
  const original = { uri: file.uri, fileName: file.fileName, mimeType: file.mimeType };
  let prepared = original;
  try {
    prepared = await compressForUpload(file);
  } catch (err) {
    console.warn('Compression failed, sending original:', (err as Error)?.message);
  }

  try {
    return await uploadPrepared(prepared, report);
  } catch (err) {
    // The compressed copy may be broken/unreadable — try the untouched
    // original once. Skip when the server said "too large" (original is
    // bigger, so it would only fail the same way).
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (prepared.uri !== original.uri && status !== 413) {
      console.warn('Upload of compressed file failed, retrying original:', (err as Error)?.message);
      return uploadPrepared(original, report);
    }
    throw err;
  }
}

async function uploadPrepared(
  prepared: { uri: string; fileName: string; mimeType: string },
  report: (phase: UploadProgress['phase'], fraction: number) => void,
): Promise<ChatMediaUploadResult> {
  const resourceType = prepared.mimeType.startsWith('video/')
    ? ('video' as const)
    : ('image' as const);
  // Compression done: 5%. Upload bytes map onto 5%..95%, register = 100%.
  report('uploading', 0.05);
  const onUploadProgress = (evt: { loaded: number; total?: number }) =>
    report('uploading', 0.05 + 0.9 * uploadFraction(evt));

  try {
    const sign = await apiClient
      .get<CloudinarySign>('/chat/media/upload-sign', {
        params: { resourceType },
        skipErrorToast: true,
      } as Record<string, unknown>)
      .then((res) => res.data);

    if (sign.enabled) {
      const cloudForm = new FormData();
      await appendFileToFormData(cloudForm, {
        uri: prepared.uri,
        name: prepared.fileName,
        type: prepared.mimeType,
      });
      cloudForm.append('api_key', sign.apiKey);
      cloudForm.append('timestamp', String(sign.timestamp));
      cloudForm.append('signature', sign.signature);
      cloudForm.append('folder', sign.folder);
      cloudForm.append('public_id', sign.publicId);
      cloudForm.append('type', sign.type);

      // Bare axios (no API interceptors/auth header) straight to the CDN.
      const cloudRes = await axios.post<{ public_id?: string }>(sign.uploadUrl, cloudForm, {
        timeout: 180_000,
        transformRequest: stripMultipartContentType,
        onUploadProgress,
        validateStatus: () => true,
      });
      if (cloudRes.status < 200 || cloudRes.status >= 300) {
        throw new Error(`Cloudinary upload failed (${cloudRes.status})`);
      }
      if (!cloudRes.data?.public_id) {
        throw new Error('Cloudinary response missing public_id');
      }

      report('finalizing', 0.96);
      const registered = await apiClient
        .post<ChatMediaUploadResult>('/chat/media/register', {
          publicId: cloudRes.data.public_id,
          resourceType,
        })
        .then((res) => res.data);
      report('finalizing', 1);
      return registered;
    }
  } catch (err) {
    // Fall through to backend proxy upload (local disk / Cloudinary via API).
    console.warn('Direct CDN upload unavailable, using API upload:', (err as Error)?.message);
    report('uploading', 0.05);
  }

  const form = new FormData();
  await appendFileToFormData(form, {
    uri: prepared.uri,
    name: prepared.fileName,
    type: prepared.mimeType,
  });
  const res = await apiClient.post<ChatMediaUploadResult>('/chat/media', form, {
    timeout: 180_000,
    transformRequest: stripMultipartContentType,
    onUploadProgress,
  });
  report('finalizing', 1);
  return res.data;
}

export function fileKeyFromChatMediaUrl(mediaUrl: string | null | undefined) {
  if (!mediaUrl) return null;
  const match = mediaUrl.match(/\/chat\/files\/([^?]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

// One socket for the whole signed-in session. Opening a chat used to create
// (and tear down) its own socket, so every chat paid a fresh handshake and
// showed "Connecting…". Now the socket is shared: screens attach/detach their
// listeners and join/leave channels, but never disconnect it.
let sharedSocket: Socket | null = null;
let sharedToken: string | null = null;
let appStateWatching = false;

function watchAppState() {
  if (appStateWatching) return;
  appStateWatching = true;
  // Socket.io drops the link while the app is suspended. Reconnect on resume
  // so live messages come back without the user reopening a chat.
  AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active' && sharedSocket && !sharedSocket.connected) {
      sharedSocket.connect();
    }
  });
}

type InboxListener = (channelKey: string | null) => void;
const inboxListeners = new Set<InboxListener>();

function notifyInbox(channelKey: string | null) {
  inboxListeners.forEach((listener) => listener(channelKey));
}

/**
 * Fires when any chat may have new/unread messages (live message, unread
 * nudge, or a reconnect that may have missed some). The inbox refetches on it.
 */
export function subscribeChatInbox(listener: InboxListener): () => void {
  inboxListeners.add(listener);
  return () => {
    inboxListeners.delete(listener);
  };
}

type MessageListener = (message: ChatMessage) => void;
const messageListeners = new Set<MessageListener>();

/** Every live message the shared socket receives (any channel), for in-app alerts. */
export function subscribeChatMessages(listener: MessageListener): () => void {
  messageListeners.add(listener);
  return () => {
    messageListeners.delete(listener);
  };
}

export function isChatSocketConnected(): boolean {
  return !!sharedSocket?.connected;
}

export function connectChatSocket(token: string): Socket {
  watchAppState();
  if (sharedSocket && sharedToken === token) {
    if (!sharedSocket.connected) sharedSocket.connect();
    return sharedSocket;
  }
  sharedSocket?.disconnect();
  sharedToken = token;
  const socket = io(apiBaseUrl, {
    auth: { token },
    // Polling fallback: some networks/proxies block the websocket upgrade and
    // then the socket never connects at all.
    transports: ['websocket', 'polling'],
  });
  socket.on('connect', () => notifyInbox(null));
  socket.on('chat:unread', (p?: { channelKey?: string }) =>
    notifyInbox(p?.channelKey ?? null),
  );
  socket.on('message:new', (m?: ChatMessage) => {
    notifyInbox(m?.channelKey ?? null);
    if (m) messageListeners.forEach((listener) => listener(m));
  });
  sharedSocket = socket;
  return socket;
}

/** Call on sign-out so the previous account's socket is closed. */
export function disconnectChatSocket() {
  sharedSocket?.disconnect();
  sharedSocket = null;
  sharedToken = null;
}

export function resolveChatMediaUrl(mediaUrl: string | null | undefined) {
  return resolveMediaUrl(mediaUrl);
}
