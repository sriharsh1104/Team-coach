import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { ChatService } from '../chat/chat.service';
import { MembershipService } from '../membership/membership.service';
import { PrismaService } from '../prisma/prisma.service';
import { MediasoupSfuService } from './mediasoup-sfu.service';
import { VoiceGateway } from './voice.gateway';
import { VoiceModerateDto, VoiceRoomName } from './dto';
import { resolveGuildAccess } from './guild-access';
import {
  applyModeration,
  GUILD_VOICE_MAX_PARTICIPANTS,
  TEAM_VOICE_MAX_PARTICIPANTS,
  HostedRoomState,
  isUserHostMuted,
  MOD_ATTRIBUTE,
  ModerationAction,
  parseRoomState,
} from './hosted-room-state';

interface LiveKitCreds {
  url: string;
  apiKey: string;
  apiSecret: string;
}

export type VoiceOccupant = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

export type VoiceOccupancy = {
  room: VoiceRoomName;
  max: number;
  count: number;
  participants: VoiceOccupant[];
};

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  /** Serialises read-modify-write of one room's mute state. */
  private readonly roomLocks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly configService: ConfigService,
    private readonly chatService: ChatService,
    private readonly prisma: PrismaService,
    private readonly sfu: MediasoupSfuService,
    private readonly membershipService: MembershipService,
    private readonly voiceGateway: VoiceGateway,
  ) {}

  private creds(): LiveKitCreds {
    const url = this.configService.get<string>('LIVEKIT_URL');
    const apiKey = this.configService.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.configService.get<string>('LIVEKIT_API_SECRET');
    if (!url || !apiKey || !apiSecret) {
      throw new ServiceUnavailableException(
        'Hosted voice is not configured — set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET on the backend.',
      );
    }
    return { url, apiKey, apiSecret };
  }

  private roomClient(c: LiveKitCreds) {
    return new RoomServiceClient(c.url, c.apiKey, c.apiSecret);
  }

  /**
   * Which LiveKit room + what the caller may do there. The room name is always
   * derived from the caller's own org — never taken from the request.
   */
  private async resolveRoom(userId: string, room: VoiceRoomName) {
    if (room === 'guild') {
      let access: { orgId: string; canModerate: boolean };
      try {
        access = await resolveGuildAccess(this.prisma, userId);
      } catch (err) {
        throw new ForbiddenException((err as Error).message);
      }
      return {
        kind: 'guild' as const,
        orgId: access.orgId,
        roomName: `guild:${access.orgId}`,
        canModerate: access.canModerate,
      };
    }
    const orgId = await this.chatService.getOrgIdForUser(userId);
    return {
      kind: 'team' as const,
      orgId,
      roomName: orgId,
      canModerate: await this.membershipService.hasEditAccess(userId, orgId),
    };
  }

  /**
   * Who is already in the voice room — for lobby + chat indicators.
   * Does not join the caller; only lists current occupants.
   */
  async getOccupancy(userId: string, room: VoiceRoomName = 'team'): Promise<VoiceOccupancy> {
    const max =
      room === 'guild' ? GUILD_VOICE_MAX_PARTICIPANTS : TEAM_VOICE_MAX_PARTICIPANTS;
    const ctx = await this.resolveRoom(userId, room);

    if (this.sfu.isSelfHosted()) {
      const participants = await this.voiceGateway.listOccupants(ctx.roomName);
      return { room: ctx.kind, max, count: participants.length, participants };
    }

    const creds = this.creds();
    const client = this.roomClient(creds);
    let participants: VoiceOccupant[] = [];
    try {
      const live = await client.listParticipants(ctx.roomName);
      participants = live.map((p) => {
        let avatarUrl: string | null = null;
        if (p.metadata) {
          try {
            const meta = JSON.parse(p.metadata) as { avatarUrl?: string | null };
            avatarUrl = meta.avatarUrl ?? null;
          } catch {
            // ignore malformed metadata
          }
        }
        return {
          id: p.identity,
          name: p.name || p.identity,
          avatarUrl,
        };
      });
    } catch (err) {
      // Room may not exist yet — treat as empty.
      this.logger.debug(
        `listParticipants(${ctx.roomName}): ${(err as Error).message}`,
      );
    }
    return { room: ctx.kind, max, count: participants.length, participants };
  }

  async getConfig(userId: string, room: VoiceRoomName = 'team') {
    const max =
      room === 'guild' ? GUILD_VOICE_MAX_PARTICIPANTS : TEAM_VOICE_MAX_PARTICIPANTS;

    if (this.sfu.isSelfHosted()) {
      return { mode: 'self' as const, max, room };
    }

    // Config check first so a missing LiveKit setup fails cleanly before any lookups.
    const creds = this.creds();
    const ctx = await this.resolveRoom(userId, room);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    let canPublish = true;
    let state: HostedRoomState | undefined;
    const client = this.roomClient(creds);
    // Idempotent — returns the live room if it already exists. Enforces the cap.
    const lkRoom = await client.createRoom({
      name: ctx.roomName,
      maxParticipants: max,
      emptyTimeout: 120,
    });
    if (ctx.kind === 'guild') {
      state = parseRoomState(lkRoom.metadata);
      // Rejoining must not be a way around a host mute.
      canPublish = !isUserHostMuted(state, userId, ctx.canModerate);
    }

    const token = new AccessToken(creds.apiKey, creds.apiSecret, {
      identity: user.id,
      name: user.name,
      attributes: { [MOD_ATTRIBUTE]: ctx.canModerate ? '1' : '0' },
      // Carried to every other participant via Participant.metadata — lets
      // the voice screen show a real avatar instead of just initials.
      metadata: JSON.stringify({ avatarUrl: user.avatarUrl }),
    });
    token.addGrant({
      roomJoin: true,
      room: ctx.roomName,
      canPublish,
      canSubscribe: true,
    });

    return {
      mode: 'hosted' as const,
      url: creds.url,
      token: await token.toJwt(),
      room: ctx.kind,
      canModerate: ctx.canModerate,
      max,
    };
  }

  /**
   * Moderation for hosted voice. Authorisation is decided here from the DB —
   * the client only says what it wants. Mutes are enforced by revoking the
   * target's publish permission on the LiveKit server.
   */
  async moderate(userId: string, dto: VoiceModerateDto) {
    if (this.sfu.isSelfHosted()) {
      throw new BadRequestException('Moderation runs over the voice socket in self-hosted mode');
    }
    const creds = this.creds();
    const ctx = await this.resolveRoom(userId, dto.room);
    const client = this.roomClient(creds);

    if (dto.action === 'kick') {
      if (!ctx.canModerate) {
        throw new ForbiddenException(
          ctx.kind === 'guild'
            ? 'Only the owner or guild leaders can remove people'
            : 'Only the org owner or a coach can kick',
        );
      }
      if (!dto.userId || dto.userId === userId) {
        throw new BadRequestException('Invalid kick target');
      }
      try {
        await client.removeParticipant(ctx.roomName, dto.userId);
        return { kicked: 1 };
      } catch {
        return { kicked: 0 }; // already gone
      }
    }

    if (ctx.kind !== 'guild' || !ctx.canModerate) {
      throw new ForbiddenException('Only the owner or guild leaders can do that');
    }
    const action = dto.action as ModerationAction;
    if ((action === 'mute' || action === 'unmute') && !dto.userId) {
      throw new BadRequestException('Missing user');
    }

    return this.withRoomLock(ctx.roomName, async () => {
      if (dto.userId && (action === 'mute' || action === 'unmute')) {
        let target;
        try {
          target = await client.getParticipant(ctx.roomName, dto.userId);
        } catch {
          throw new BadRequestException('That person is not in the voice room');
        }
        if (target.attributes?.[MOD_ATTRIBUTE] === '1') {
          throw new BadRequestException('Hosts cannot be muted');
        }
      }

      const rooms = await client.listRooms([ctx.roomName]);
      const current = parseRoomState(rooms[0]?.metadata);
      const next = applyModeration(current, action, dto.userId);
      await client.updateRoomMetadata(ctx.roomName, JSON.stringify(next));
      await this.enforce(client, ctx.roomName, next);
      return { ok: true };
    });
  }

  /** Make every participant's publish permission match the room state. */
  private async enforce(client: RoomServiceClient, roomName: string, state: HostedRoomState) {
    const participants = await client.listParticipants(roomName);
    await Promise.all(
      participants.map(async (p) => {
        const isHost = p.attributes?.[MOD_ATTRIBUTE] === '1';
        const canPublish = !isUserHostMuted(state, p.identity, isHost);
        if ((p.permission?.canPublish ?? true) === canPublish) return;
        try {
          await client.updateParticipant(roomName, p.identity, undefined, {
            canPublish,
            canSubscribe: true,
            canPublishData: true,
          });
        } catch (err) {
          this.logger.warn(
            `Could not update voice permissions for ${p.identity}: ${(err as Error).message}`,
          );
        }
      }),
    );
  }

  private async withRoomLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.roomLocks.get(key) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(fn);
    this.roomLocks.set(key, run);
    try {
      return await run;
    } finally {
      if (this.roomLocks.get(key) === run) this.roomLocks.delete(key);
    }
  }
}
