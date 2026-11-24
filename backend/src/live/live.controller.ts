import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LiveService } from './live.service';

@Controller('live')
@UseGuards(JwtAuthGuard)
export class LiveController {
  constructor(private readonly liveService: LiveService) {}

  /**
   * Poll YouTube Live Chat for an active broadcast.
   * Query: videoId (or watch/live URL), optional pageToken from the prior response.
   */
  @Get('youtube-chat')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  youtubeChat(
    @Query('videoId') videoId: string,
    @Query('pageToken') pageToken?: string,
  ) {
    return this.liveService.fetchYoutubeLiveChat(videoId ?? '', pageToken);
  }
}
