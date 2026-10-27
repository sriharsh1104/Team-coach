import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken } from 'livekit-server-sdk';
import { ChatService } from '../chat/chat.service';
import { PrismaService } from '../prisma/prisma.service';
import { MediasoupSfuService } from './mediasoup-sfu.service';

@Injectable()
export class VoiceService {
  constructor(
    private readonly configService: ConfigService,
    private readonly chatService: ChatService,
    private readonly prisma: PrismaService,
    private readonly sfu: MediasoupSfuService,
  ) {}

  async getConfig(userId: string) {
    if (this.sfu.isSelfHosted()) {
      return { mode: 'self' as const };
    }

    const orgId = await this.chatService.getOrgIdForUser(userId);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const url = this.configService.get<string>('LIVEKIT_URL');
    const apiKey = this.configService.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.configService.get<string>('LIVEKIT_API_SECRET');
    if (!url || !apiKey || !apiSecret) {
      throw new ServiceUnavailableException(
        'Hosted voice is not configured — set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET on the backend.',
      );
    }

    const token = new AccessToken(apiKey, apiSecret, {
      identity: user.id,
      name: user.name,
    });
    token.addGrant({
      roomJoin: true,
      room: orgId,
      canPublish: true,
      canSubscribe: true,
    });

    return { mode: 'hosted' as const, url, token: await token.toJwt() };
  }
}
