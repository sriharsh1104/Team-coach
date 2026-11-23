import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
} from 'livekit-server-sdk';
import { ChatService } from '../chat/chat.service';
import {
  PushMessage,
  PushNotificationService,
} from '../common/push-notification.service';
import { MembershipService } from '../membership/membership.service';
import { PrismaService } from '../prisma/prisma.service';
import { MediasoupSfuService } from './mediasoup-sfu.service';
import { VoiceGateway } from './voice.gateway';
import { VoiceInviteDto, VoiceModerateDto, VoiceRoomName } from './dto';
import { resolveGuildAccess } from './guild-access';
import {
  applyModeration,
  DIRECT_VOICE_MAX_PARTICIPANTS,
  GUILD_VOICE_MAX_PARTICIPANTS,
  TEAM_VOICE_MAX_PARTICIPANTS,
  HostedRoomState,
  isUserHostMuted,
  MOD_ATTRIBUTE,
  OWNER_ATTRIBUTE,
  ModerationAction,
  parseRoomState,
} from './hosted-room-state';

/** How long before the same person can be pinged by the same teammate again. */
const VOICE_INVITE_COOLDOWN_MS = 5 * 60 * 1000;

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
  /** `senderId>targetId` → when that pair was last pinged (ms). */
  private readonly inviteCooldowns = new Map<string, number>();

  constructor(
    private readonly configService: ConfigService,
    private readonly chatService: ChatService,
    private readonly prisma: PrismaService,
    private readonly sfu: MediasoupSfuService,
    private readonly membershipService: MembershipService,
    private readonly voiceGateway: VoiceGateway,
    private readonly pushNotifications: PushNotificationService,
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
  /**
   * The room name for a 1-on-1 call: both user ids, sorted, so each side
   * derives the identical name without either having to tell the other.
   */
  private static directRoomName(a: string, b: string) {
    return `direct:${[a, b].sort().join(':')}`;
  }

  /**
   * Three things must hold, all re-read here on every token mint so a change
   * takes effect on the next join rather than when some token expires:
   *
   *  1. both people hold `canDirectVoice` (only a platform admin sets it),
   *  2. both are in a guild at all, and
   *  3. it is the SAME guild.
   *
   * So a grant to one person alone opens nothing, and a grant to two people
   * in different guilds opens nothing either — the admin is enabling a pair
   * inside one guild, not a line across the platform.
   */
  private async resolveDirectRoom(userId: string, peerId: string | undefined) {
    if (!peerId) {
      throw new BadRequestException('Pick who you want to call');
    }
    if (peerId === userId) {
      throw new BadRequestException('You cannot call yourself');
    }
    const select = {
      canDirectVoice: true,
      // At most one row — GuildMembership is unique per user.
      guildMemberships: { select: { orgId: true }, take: 1 },
    };
    const [me, peer] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select }),
      this.prisma.user.findUnique({ where: { id: peerId }, select }),
    ]);
    if (!me?.canDirectVoice) {
      throw new ForbiddenException('Direct voice is not enabled for you');
    }
    const myGuildId = me.guildMemberships[0]?.orgId ?? null;
    if (!myGuildId) {
      // About the caller's own account, so it can say what is actually wrong.
      throw new ForbiddenException('Join a guild to use 1-on-1 voice');
    }
    // Deliberately the same message for all three peer-side failures — does
    // the account exist, does it hold the permission, is it in my guild.
    // Any of them answered separately would let a caller probe ids and map
    // out who is in which guild.
    const peerGuildId = peer?.guildMemberships[0]?.orgId ?? null;
    if (!peer?.canDirectVoice || peerGuildId !== myGuildId) {
      throw new ForbiddenException('Direct voice is not available with them');
    }
    return {
      kind: 'direct' as const,
      // The room is scoped to the guild the pair share, but it is still a
      // private 2-seat room — not the guild's own voice channel.
      orgId: null,
      roomName: VoiceService.directRoomName(userId, peerId),
      canModerate: false,
      isOwner: false,
    };
  }

  private async resolveRoom(
    userId: string,
    room: VoiceRoomName,
    peerId?: string,
  ) {
    if (room === 'direct') {
      return this.resolveDirectRoom(userId, peerId);
    }
    if (room === 'guild') {
      let access: { orgId: string; canModerate: boolean; isOwner: boolean };
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
        isOwner: access.isOwner,
      };
    }
    const orgId = await this.chatService.getOrgIdForUser(userId);
    const membership = await this.prisma.membership.findFirst({
      where: { userId, orgId },
      select: { isOwner: true },
    });
    return {
      kind: 'team' as const,
      orgId,
      roomName: orgId,
      // Individual host tools (if any) still use edit access; kick is owner-only.
      canModerate: await this.membershipService.hasEditAccess(userId, orgId),
      isOwner: !!membership?.isOwner,
    };
  }

  /**
   * Who this person can place a 1-on-1 call to: other holders of the same
   * admin-granted permission **in their own guild**. Mirrors exactly what
   * resolveDirectRoom will allow, so nobody is ever shown a contact the call
   * would then refuse.
   *
   * Returns an empty list rather than an error in every failure case, so the
   * client can just render the state:
   *   enabled false              → no permission, hide the section
   *   enabled true, needsGuild   → granted, but they are in no guild yet
   *   enabled true, empty peers  → nobody else in their guild has it
   */
  async listDirectVoicePeers(userId: string) {
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        canDirectVoice: true,
        guildMemberships: { select: { orgId: true }, take: 1 },
      },
    });
    if (!me?.canDirectVoice) {
      return { enabled: false, needsGuild: false, peers: [] };
    }

    const guildId = me.guildMemberships[0]?.orgId ?? null;
    if (!guildId) return { enabled: true, needsGuild: true, peers: [] };

    const peers = await this.prisma.user.findMany({
      where: {
        canDirectVoice: true,
        id: { not: userId },
        guildMemberships: { some: { orgId: guildId } },
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, inGameName: true, avatarUrl: true },
    });
    return {
      enabled: true,
      needsGuild: false,
      peers: peers.map((p) => ({
        id: p.id,
        name: p.inGameName?.trim() || p.name,
        avatarUrl: p.avatarUrl,
      })),
    };
  }

  /** Seats per room kind. */
  private maxFor(room: VoiceRoomName): number {
    if (room === 'guild') return GUILD_VOICE_MAX_PARTICIPANTS;
    if (room === 'direct') return DIRECT_VOICE_MAX_PARTICIPANTS;
    return TEAM_VOICE_MAX_PARTICIPANTS;
  }

  /**
   * Who is already in the voice room — for lobby + chat indicators.
   * Does not join the caller; only lists current occupants.
   */
  async getOccupancy(
    userId: string,
    room: VoiceRoomName = 'team',
    peerId?: string,
  ): Promise<VoiceOccupancy> {
    const max = this.maxFor(room);
    const ctx = await this.resolveRoom(userId, room, peerId);

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
            const meta = JSON.parse(p.metadata) as {
              avatarUrl?: string | null;
            };
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

  async getConfig(
    userId: string,
    room: VoiceRoomName = 'team',
    peerId?: string,
  ) {
    const max = this.maxFor(room);

    if (this.sfu.isSelfHosted()) {
      if (room === 'direct') {
        // The mediasoup gateway has no notion of a pair room, and silently
        // dropping someone into the team room would be worse than saying so.
        throw new ServiceUnavailableException(
          'One-to-one voice needs hosted voice (LiveKit).',
        );
      }
      return { mode: 'self' as const, max, room };
    }

    // Config check first so a missing LiveKit setup fails cleanly before any lookups.
    const creds = this.creds();
    const ctx = await this.resolveRoom(userId, room, peerId);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

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
      // Rejoining must not be a way around a host mute / announcement.
      canPublish = !isUserHostMuted(
        state,
        userId,
        ctx.canModerate,
        ctx.isOwner,
      );
    }

    const token = new AccessToken(creds.apiKey, creds.apiSecret, {
      identity: user.id,
      name: user.name,
      attributes: {
        [MOD_ATTRIBUTE]: ctx.canModerate ? '1' : '0',
        [OWNER_ATTRIBUTE]: ctx.isOwner ? '1' : '0',
      },
      // Carried to every other participant via Participant.metadata — lets
      // the voice screen show a real avatar instead of just initials.
      metadata: JSON.stringify({ avatarUrl: user.avatarUrl }),
    });
    // Explicit sources so LiveKit Cloud / room defaults never block in-call
    // screen share. Mic stays the primary publish; camera not needed for voice.
    token.addGrant({
      roomJoin: true,
      room: ctx.roomName,
      canPublish,
      canSubscribe: true,
      ...(canPublish
        ? {
            canPublishSources: [
              TrackSource.MICROPHONE,
              TrackSource.SCREEN_SHARE,
              TrackSource.SCREEN_SHARE_AUDIO,
            ],
          }
        : {}),
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
   * "Ping to join" — tell specific teammates you are waiting in team voice.
   *
   * Deliberately narrow so it stays a nudge between friends rather than a
   * broadcast: the caller must already be in the room, targets must be in the
   * caller's own org, anyone already in the call is skipped, and the same
   * pair cannot be pinged again for a few minutes.
   */
  async invite(userId: string, dto: VoiceInviteDto) {
    const ctx = await this.resolveRoom(userId, 'team');
    const occupancy = await this.getOccupancy(userId, 'team');
    const inRoom = new Set(occupancy.participants.map((p) => p.id));
    if (!inRoom.has(userId)) {
      throw new BadRequestException(
        'Join the voice channel first, then ping your team.',
      );
    }

    const wanted = [...new Set(dto.userIds)].filter(
      (id) => id !== userId && !inRoom.has(id),
    );
    if (wanted.length === 0) return { sent: 0, skipped: 0 };

    // Org membership is checked here, never trusted from the request: the
    // list the client shows could be stale or tampered with.
    const [sender, members] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { name: true, inGameName: true },
      }),
      this.prisma.membership.findMany({
        where: { orgId: ctx.orgId, userId: { in: wanted } },
        select: { userId: true },
      }),
    ]);
    const teammateIds = members.map((m) => m.userId);
    if (teammateIds.length === 0) return { sent: 0, skipped: wanted.length };

    const now = Date.now();
    this.pruneInviteCooldowns(now);
    const allowed = teammateIds.filter((id) => {
      const last = this.inviteCooldowns.get(`${userId}>${id}`);
      return last === undefined || now - last >= VOICE_INVITE_COOLDOWN_MS;
    });
    if (allowed.length === 0) {
      return { sent: 0, skipped: wanted.length };
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: allowed } },
      select: { id: true, expoPushToken: true },
    });
    const senderName = sender.inGameName ?? sender.name ?? 'A teammate';

    const messages: PushMessage[] = [];
    const pinged: string[] = [];
    for (const u of users) {
      const pushTokens = this.pushNotifications.tokensFor(u.expoPushToken);
      if (pushTokens.length === 0) continue;
      pinged.push(u.id);
      for (const to of pushTokens) {
        messages.push({
          to,
          title: `${senderName} is waiting in Team Voice`,
          body: 'Tap to join the voice channel.',
          data: { type: 'voice_invite', voiceRoom: 'team', senderId: userId },
          // One pending nudge per sender in the tray, not a stack of them.
          collapseId: `voice-invite:${ctx.orgId}:${userId}:${u.id}`,
          channelId: 'voice',
          priority: 'high',
        });
      }
    }

    // Only start the cooldown for people a push actually went to, so someone
    // without a registered device does not silently burn their window.
    for (const id of pinged) this.inviteCooldowns.set(`${userId}>${id}`, now);
    await this.pushNotifications.send(messages);
    return { sent: pinged.length, skipped: wanted.length - pinged.length };
  }

  private pruneInviteCooldowns(now: number) {
    for (const [key, at] of this.inviteCooldowns) {
      if (now - at >= VOICE_INVITE_COOLDOWN_MS)
        this.inviteCooldowns.delete(key);
    }
  }

  /**
   * Moderation for hosted voice. Authorisation is decided here from the DB —
   * the client only says what it wants. Mutes are enforced by revoking the
   * target's publish permission on the LiveKit server.
   */
  async moderate(userId: string, dto: VoiceModerateDto) {
    if (this.sfu.isSelfHosted()) {
      throw new BadRequestException(
        'Moderation runs over the voice socket in self-hosted mode',
      );
    }
    const creds = this.creds();
    const ctx = await this.resolveRoom(userId, dto.room);
    const client = this.roomClient(creds);

    if (dto.action === 'kick') {
      if (!ctx.isOwner) {
        throw new ForbiddenException('Only the org owner can kick');
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

    if (ctx.kind !== 'guild') {
      throw new ForbiddenException('Mute controls are only for guild voice');
    }
    const action = dto.action as ModerationAction;
    // Announcement (mute everyone / restore): owner only.
    if (action === 'muteAll' || action === 'unmuteAll') {
      if (!ctx.isOwner) {
        throw new ForbiddenException(
          'Only the org owner can mute everyone for an announcement',
        );
      }
    } else if (!ctx.canModerate) {
      throw new ForbiddenException(
        'Only the owner or guild leaders can do that',
      );
    }
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
  private async enforce(
    client: RoomServiceClient,
    roomName: string,
    state: HostedRoomState,
  ) {
    const participants = await client.listParticipants(roomName);
    await Promise.all(
      participants.map(async (p) => {
        const isHost = p.attributes?.[MOD_ATTRIBUTE] === '1';
        const isOwner = p.attributes?.[OWNER_ATTRIBUTE] === '1';
        const canPublish = !isUserHostMuted(
          state,
          p.identity,
          isHost,
          isOwner,
        );
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
