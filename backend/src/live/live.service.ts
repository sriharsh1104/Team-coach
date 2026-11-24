import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseYoutubeVideoId } from './youtube-chat.util';

export type YoutubeLiveComment = {
  id: string;
  author: string;
  text: string;
  publishedAt: string;
};

type YoutubeChatPage = {
  liveChatId: string;
  comments: YoutubeLiveComment[];
  nextPageToken: string | null;
  /** Suggested delay before next poll (ms) from YouTube. */
  pollingIntervalMs: number;
};

@Injectable()
export class LiveService {
  private readonly logger = new Logger(LiveService.name);
  /** Cache videoId → liveChatId for the active stream. */
  private readonly chatIdByVideo = new Map<string, string>();

  constructor(private readonly config: ConfigService) {}

  private apiKey(): string {
    return (
      this.config.get<string>('YOUTUBE_DATA_API_KEY')?.trim() ||
      this.config.get<string>('YOUTUBE_API_KEY')?.trim() ||
      ''
    );
  }

  async fetchYoutubeLiveChat(
    videoIdOrUrl: string,
    pageToken?: string,
  ): Promise<YoutubeChatPage> {
    const key = this.apiKey();
    if (!key) {
      throw new ServiceUnavailableException(
        'YouTube live chat is not configured (YOUTUBE_DATA_API_KEY)',
      );
    }
    const videoId = parseYoutubeVideoId(videoIdOrUrl);
    if (!videoId) {
      throw new BadRequestException('Invalid YouTube video URL or id');
    }

    const liveChatId = await this.resolveLiveChatId(videoId, key);
    const params = new URLSearchParams({
      part: 'snippet,authorDetails',
      liveChatId,
      maxResults: '25',
      key,
    });
    if (pageToken?.trim()) params.set('pageToken', pageToken.trim());

    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/liveChat/messages?${params}`,
    );
    const body = (await res.json()) as {
      error?: { message?: string };
      items?: Array<{
        id?: string;
        snippet?: {
          type?: string;
          publishedAt?: string;
          displayMessage?: string;
          textMessageDetails?: { messageText?: string };
        };
        authorDetails?: { displayName?: string };
      }>;
      nextPageToken?: string;
      pollingIntervalMillis?: number;
    };

    if (!res.ok) {
      const msg = body.error?.message || `YouTube API ${res.status}`;
      this.logger.warn(`liveChatMessages.list failed: ${msg}`);
      throw new BadRequestException(msg);
    }

    const comments: YoutubeLiveComment[] = [];
    for (const item of body.items ?? []) {
      const type = item.snippet?.type;
      if (type && type !== 'textMessageEvent') continue;
      const text =
        item.snippet?.textMessageDetails?.messageText?.trim() ||
        item.snippet?.displayMessage?.trim() ||
        '';
      if (!text) continue;
      comments.push({
        id: item.id || `${videoId}-${item.snippet?.publishedAt}-${text.slice(0, 12)}`,
        author: item.authorDetails?.displayName?.trim() || 'Viewer',
        text: text.length > 120 ? `${text.slice(0, 117)}…` : text,
        publishedAt: item.snippet?.publishedAt || new Date().toISOString(),
      });
    }

    return {
      liveChatId,
      comments,
      nextPageToken: body.nextPageToken ?? null,
      pollingIntervalMs: Math.max(
        3000,
        Math.min(body.pollingIntervalMillis ?? 5000, 15000),
      ),
    };
  }

  private async resolveLiveChatId(videoId: string, key: string): Promise<string> {
    const cached = this.chatIdByVideo.get(videoId);
    if (cached) return cached;

    const params = new URLSearchParams({
      part: 'liveStreamingDetails',
      id: videoId,
      key,
    });
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?${params}`,
    );
    const body = (await res.json()) as {
      error?: { message?: string };
      items?: Array<{
        liveStreamingDetails?: { activeLiveChatId?: string };
      }>;
    };
    if (!res.ok) {
      throw new BadRequestException(
        body.error?.message || `YouTube API ${res.status}`,
      );
    }
    const chatId = body.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
    if (!chatId) {
      throw new BadRequestException(
        'No active live chat for this video — start the YouTube live first, then paste the watch/live URL',
      );
    }
    this.chatIdByVideo.set(videoId, chatId);
    return chatId;
  }
}
