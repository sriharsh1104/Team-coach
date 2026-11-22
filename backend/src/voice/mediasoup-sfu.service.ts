import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mediasoup from 'mediasoup';
import {
  AudioLevelObserver,
  Producer,
  Router,
  Worker,
} from 'mediasoup/node/lib/types';

export interface RoomParticipantProducer {
  producerId: string;
  userId: string;
  userName: string;
  avatarUrl: string | null;
  kind: 'audio';
}

interface RoomState {
  router: Router;
  // Keyed by producerId — lets a newly-joined peer discover who's already talking.
  producers: Map<string, RoomParticipantProducer>;
  // Drives the "who is speaking" highlight on every client — mediasoup
  // measures RTP audio levels server-side so clients don't have to.
  audioLevelObserver: AudioLevelObserver;
}

export type SpeakingListener = (orgId: string, userIds: string[]) => void;

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
  private speakingListeners = new Set<SpeakingListener>();

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    if (!this.isSelfHosted()) return;

    try {
      this.worker = await mediasoup.createWorker({
        rtcMinPort: Number(
          this.configService.get('MEDIASOUP_MIN_PORT', '40000'),
        ),
        rtcMaxPort: Number(
          this.configService.get('MEDIASOUP_MAX_PORT', '40200'),
        ),
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
    const announcedIp = this.configService.get<string>(
      'MEDIASOUP_ANNOUNCED_IP',
    );
    if (!announcedIp || announcedIp === '127.0.0.1') {
      this.logger.warn(
        'MEDIASOUP_ANNOUNCED_IP is unset/127.0.0.1 — only clients on this same machine will get audio. Set it to the server public IP in production.',
      );
    }
    this.logger.log('mediasoup worker started');
  }

  async onModuleDestroy() {
    this.worker?.close();
  }

  isSelfHosted(): boolean {
    return this.configService.get('VOICE_SELF_HOSTED', 'true') === 'true';
  }

  /** Subscribe to "these users are currently speaking in this org" updates. */
  onSpeaking(listener: SpeakingListener) {
    this.speakingListeners.add(listener);
  }

  async getOrCreateRoom(orgId: string): Promise<RoomState> {
    if (!this.worker) {
      throw new ServiceUnavailableException('Voice worker is not running');
    }
    let room = this.rooms.get(orgId);
    if (!room) {
      const router = await this.worker.createRouter({
        mediaCodecs: MEDIA_CODECS,
      });
      const audioLevelObserver = await router.createAudioLevelObserver({
        maxEntries: 8,
        threshold: -55,
        interval: 400,
      });
      room = { router, producers: new Map(), audioLevelObserver };
      this.rooms.set(orgId, room);

      const current = room;
      audioLevelObserver.on('volumes', (volumes) => {
        const userIds = new Set<string>();
        for (const { producer } of volumes) {
          const owner = current.producers.get(producer.id);
          if (owner) userIds.add(owner.userId);
        }
        this.emitSpeaking(orgId, [...userIds]);
      });
      audioLevelObserver.on('silence', () => this.emitSpeaking(orgId, []));
    }
    return room;
  }

  /** Drops the router once nobody is left so a long-running server doesn't accumulate them. */
  closeRoomIfEmpty(orgId: string, connectedPeers: number) {
    const room = this.rooms.get(orgId);
    if (!room || connectedPeers > 0 || room.producers.size > 0) return;
    room.audioLevelObserver.close();
    room.router.close();
    this.rooms.delete(orgId);
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

  async registerProducer(
    orgId: string,
    producer: Producer,
    entry: RoomParticipantProducer,
  ) {
    const room = this.rooms.get(orgId);
    if (!room) return;
    room.producers.set(entry.producerId, entry);
    try {
      await room.audioLevelObserver.addProducer({ producerId: producer.id });
    } catch (err) {
      // Non-fatal: speaking highlight just won't light up for this producer.
      this.logger.warn(
        `audioLevelObserver.addProducer failed: ${(err as Error).message}`,
      );
    }
  }

  unregisterProducer(orgId: string, producerId: string) {
    const room = this.rooms.get(orgId);
    if (!room) return;
    room.producers.delete(producerId);
    try {
      room.audioLevelObserver.removeProducer({ producerId });
    } catch {
      // Producer may already be gone (transport closed first) — fine.
    }
  }

  listProducers(orgId: string): RoomParticipantProducer[] {
    return [...(this.rooms.get(orgId)?.producers.values() ?? [])];
  }

  private emitSpeaking(orgId: string, userIds: string[]) {
    for (const listener of this.speakingListeners) {
      try {
        listener(orgId, userIds);
      } catch (err) {
        this.logger.warn(`speaking listener threw: ${(err as Error).message}`);
      }
    }
  }
}
