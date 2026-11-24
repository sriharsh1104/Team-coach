import { apiClient } from './client';

export type YoutubeLiveComment = {
  id: string;
  author: string;
  text: string;
  publishedAt: string;
};

export type YoutubeLiveChatPage = {
  liveChatId: string;
  comments: YoutubeLiveComment[];
  nextPageToken: string | null;
  pollingIntervalMs: number;
};

/** Poll YouTube Live Chat for an active broadcast (backend proxies the free API). */
export function fetchYoutubeLiveChat(videoIdOrUrl: string, pageToken?: string | null) {
  return apiClient
    .get<YoutubeLiveChatPage>('/live/youtube-chat', {
      params: {
        videoId: videoIdOrUrl,
        ...(pageToken ? { pageToken } : {}),
      },
      skipErrorToast: true,
      skipLoader: true,
    } as Record<string, unknown>)
    .then((res) => res.data);
}
