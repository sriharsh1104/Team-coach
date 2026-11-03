import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mediasoup from 'mediasoup';
import { Router, Worker } from 'mediasoup/node/lib/types';

export interface RoomParticipantProducer {
  producerId: string;
  userId: string;
  userName: string;
  kind: 'audio';
}

interface RoomState {
  router: Router;
  // Keyed by producerId — lets a newly-joined peer discover who's already talking.
  producers: Map<string, RoomParticipantProducer>;
}

// Audio-only — this is a voice channel, not a video call.
const MEDIA_CODECS: mediasoup.types.RouterRtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
];

@Injectable()
export class MediasoupSfuService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediasoupSfuService.name);
  private worker: Worker;
  private rooms = new Map<string, RoomState>();

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    if (!this.isSelfHosted()) return;

    try {
      this.worker = await mediasoup.createWorker({
        rtcMinPort: Number(this.configService.get('MEDIASOUP_MIN_PORT', '40000')),
        rtcMaxPort: Number(this.configService.get('MEDIASOUP_MAX_PORT', '40100')),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `mediasoup worker did not start (${message}). Voice stays off until VOICE_SELF_HOSTED=false or the worker binary is installed.`,
      );
      return;
    }
    this.worker.on('died', () => {
      this.logger.error('mediasoup worker died, restart the server');
    });
    this.logger.log('mediasoup worker started');
  }

  async onModuleDestroy() {
    this.worker?.close();
  }

  isSelfHosted(): boolean {
    return this.configService.get('VOICE_SELF_HOSTED', 'true') === 'true';
  }

  async getOrCreateRoom(orgId: string): Promise<RoomState> {
    if (!this.worker) {
      throw new ServiceUnavailableException('Voice worker is not running');
    }
    let room = this.rooms.get(orgId);
    if (!room) {
      const router = await this.worker.createRouter({ mediaCodecs: MEDIA_CODECS });
      room = { router, producers: new Map() };
      this.rooms.set(orgId, room);
    }
    return room;
  }

  async createWebRtcTransport(orgId: string) {
    const room = await this.getOrCreateRoom(orgId);
    const announcedIp = this.configService.get<string>(
      'MEDIASOUP_ANNOUNCED_IP',
      '127.0.0.1',
    );

    const transport = await room.router.createWebRtcTransport({
      listenIps: [{ ip: '0.0.0.0', announcedIp }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    });

    return transport;
  }

  registerProducer(orgId: string, entry: RoomParticipantProducer) {
    const room = this.rooms.get(orgId);
    room?.producers.set(entry.producerId, entry);
  }

  unregisterProducer(orgId: string, producerId: string) {
    this.rooms.get(orgId)?.producers.delete(producerId);
  }

  listProducers(orgId: string): RoomParticipantProducer[] {
    return [...(this.rooms.get(orgId)?.producers.values() ?? [])];
  }
}
