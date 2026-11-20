import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import {
  Consumer,
  Producer,
  WebRtcTransport,
} from 'mediasoup/node/lib/types';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from '../chat/chat.service';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { MembershipService } from '../membership/membership.service';
import { MediasoupSfuService } from './mediasoup-sfu.service';
import { resolveGuildAccess } from './guild-access';
import { GUILD_VOICE_MAX_PARTICIPANTS } from './hosted-room-state';
import { WsRateLimiter } from '../common/ws-rate-limiter';
import { corsOrigin } from '../common/cors-origin';

/** 'team' = org roster voice (existing); 'guild' = guild-wide voice with host controls. */
type VoiceRoomKind = 'team' | 'guild';

/** Hard cap for Guild Voice — one extra join past this is refused. */
export { GUILD_VOICE_MAX_PARTICIPANTS };

/** Server-side mute state of one guild room. Only non-moderators are ever muted. */
interface GuildRoomState {
  /** "Mute all": everyone but moderators is silent unless individually unmuted. */
  listenOnly: boolean;
  /** Explicitly muted by a moderator. */
  hostMuted: Set<string>;
  /** Explicitly allowed to speak while listenOnly is on. */
  speakers: Set<string>;
}

interface VoiceSocketData {
  userId: string;
  userName: string;
  orgId: string;
  /** Key used for the SFU router + socket.io room (orgId for team, `guild:${orgId}`). */
  roomKey: string;
  kind: VoiceRoomKind;
  /** Guild only: owner / coach / guild leader — may mute, unmute and kick. */
  canModerate: boolean;
  transports: Map<string, WebRtcTransport>;
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
}

@WebSocketGateway({
  namespace: 'voice',
  cors: { origin: corsOrigin() },
})
export class VoiceGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(VoiceGateway.name);
  // Shared across every signaling event. Joining a room costs roughly
  // 4 + 2×(other participants) events (caps, two transports, produce, then a
  // consume+resume per peer), so 150/10s comfortably covers a 50-person room
  // while still bounding a single socket spamming createTransport/produce/
  // consume to exhaust mediasoup worker resources.
  private readonly signalingLimiter = new WsRateLimiter(150, 10_000);
  // orgId -> userIds with a raised hand. Purely signaling state; cleared when
  // the user disconnects.
  private readonly raisedHands = new Map<string, Set<string>>();
  // roomKey -> host mute state (guild rooms only).
  private readonly guildRooms = new Map<string, GuildRoomState>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    // Reused only for its org-lookup helper — chat and voice both scope to "your org".
    private readonly chatService: ChatService,
    private readonly membershipService: MembershipService,
    private readonly sfu: MediasoupSfuService,
  ) {}

  afterInit(server: Server) {
    // Server-side audio-level detection → "speaking" highlight on every client.
    this.sfu.onSpeaking((orgId, userIds) => {
      server.to(this.roomFor(orgId)).emit('speaking', { userIds });
    });

    // Same fix as ChatGateway: auth lives in handshake middleware, not
    // handleConnection. handleConnection's awaits (JWT verify, Prisma
    // queries, room join) ran *after* the client's 'connect' event had
    // already fired, leaving a window where a fast client calling
    // getRtpCapabilities/createTransport immediately after connecting could
    // hit a handler reading `client.data` before it was populated. Doing the
    // same work in middleware means the socket is fully set up before
    // 'connect' fires at all, and a rejection here means the client sees
    // connect_error — it never spends even an instant looking connected.
    server.use(async (socket: Socket, next) => {
      try {
        if (!this.sfu.isSelfHosted()) {
          throw new Error('Self-hosted voice is not enabled on this server');
        }

        // auth.token only — see ChatGateway for why the query-string fallback
        // was removed (log/history leakage risk).
        const token = socket.handshake.auth?.token as string | undefined;
        if (!token) throw new Error('No token provided');

        const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
        const user = await this.prisma.user.findUniqueOrThrow({
          where: { id: payload.sub },
        });
        // Same revoke check as JwtStrategy / ChatGateway — logout must kill
        // voice sessions, not only HTTP calls.
        if (user.tokenVersion !== payload.tokenVersion) {
          throw new Error('Session has been logged out');
        }
        const kind: VoiceRoomKind =
          socket.handshake.auth?.room === 'guild' ? 'guild' : 'team';

        let orgId: string;
        let canModerate = false;
        if (kind === 'guild') {
          const access = await resolveGuildAccess(this.prisma, user.id);
          orgId = access.orgId;
          canModerate = access.canModerate;
        } else {
          orgId = await this.chatService.getOrgIdForUser(payload.sub);
        }
        const roomKey = kind === 'guild' ? `guild:${orgId}` : orgId;

        if (kind === 'guild') {
          await this.assertGuildCapacity(roomKey, user.id);
        }

        const data: VoiceSocketData = {
          userId: user.id,
          userName: user.name,
          orgId,
          roomKey,
          kind,
          canModerate,
          transports: new Map(),
          producers: new Map(),
          consumers: new Map(),
        };
        socket.data = data;
        await socket.join(this.roomFor(roomKey));
        await this.sfu.getOrCreateRoom(roomKey);
        next();
      } catch (err) {
        this.logger.warn(`Rejected voice connection: ${(err as Error).message}`);
        next(err as Error);
      }
    });
  }

  async handleDisconnect(client: Socket) {
    // socket.io defaults `socket.data` to `{}`, never undefined — a socket
    // rejected in handleConnection (bad token) reaches here with that empty
    // default, not our VoiceSocketData shape, so check a field we actually set.
    const partial = client.data as Partial<VoiceSocketData>;
    if (!partial?.orgId) return;
    const data = partial as VoiceSocketData;
    const room = this.roomFor(data.roomKey);

    this.closeMedia(data);
    for (const producerId of data.producers.keys()) {
      this.server.to(room).emit('producerClosed', { producerId });
    }
    data.producers.clear();

    const hands = this.raisedHands.get(data.roomKey);
    if (hands?.delete(data.userId)) {
      this.server.to(room).emit('handRaised', { userId: data.userId, raised: false });
      if (hands.size === 0) this.raisedHands.delete(data.roomKey);
    }

    this.server.to(room).emit('peerLeft', { userId: data.userId });
    this.signalingLimiter.clear(client.id);

    // Tear the router down once the last peer is gone.
    try {
      const remaining = await this.server.in(room).fetchSockets();
      this.sfu.closeRoomIfEmpty(data.roomKey, remaining.length);
      if (data.kind === 'guild') {
        await this.afterGuildLeave(data, remaining);
      }
    } catch (err) {
      this.logger.warn(`fetchSockets failed on disconnect: ${(err as Error).message}`);
    }
  }

  /** Closes every mediasoup object this socket owns (transports close producers/consumers too). */
  private closeMedia(data: VoiceSocketData) {
    for (const producer of data.producers.values()) {
      this.sfu.unregisterProducer(data.roomKey, producer.id);
    }
    for (const transport of data.transports.values()) {
      transport.close();
    }
    data.transports.clear();
    data.consumers.clear();
  }

  private assertNotRateLimited(client: Socket) {
    if (!this.signalingLimiter.allow(client.id)) {
      throw new Error('Too many signaling requests — slow down');
    }
  }

  @SubscribeMessage('getRtpCapabilities')
  async onGetRtpCapabilities(@ConnectedSocket() client: Socket) {
    this.assertNotRateLimited(client);
    const data = client.data as VoiceSocketData;
    const room = await this.sfu.getOrCreateRoom(data.roomKey);
    return room.router.rtpCapabilities;
  }

  @SubscribeMessage('getProducers')
  onGetProducers(@ConnectedSocket() client: Socket) {
    this.assertNotRateLimited(client);
    const data = client.data as VoiceSocketData;
    const hands = this.raisedHands.get(data.roomKey);
    return this.sfu
      .listProducers(data.roomKey)
      .filter((p) => p.userId !== data.userId)
      .map((p) => ({ ...p, handRaised: hands?.has(p.userId) ?? false }));
  }

  @SubscribeMessage('createTransport')
  async onCreateTransport(@ConnectedSocket() client: Socket) {
    this.assertNotRateLimited(client);
    const data = client.data as VoiceSocketData;
    const transport = await this.sfu.createWebRtcTransport(data.roomKey);
    data.transports.set(transport.id, transport);

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  @SubscribeMessage('connectTransport')
  async onConnectTransport(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { transportId: string; dtlsParameters: unknown },
  ) {
    this.assertNotRateLimited(client);
    const data = client.data as VoiceSocketData;
    const transport = data.transports.get(body.transportId);
    if (!transport) throw new Error('Unknown transport');
    await transport.connect({ dtlsParameters: body.dtlsParameters as never });
    return { connected: true };
  }

  @SubscribeMessage('produce')
  async onProduce(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { transportId: string; kind: 'audio'; rtpParameters: unknown },
  ) {
    this.assertNotRateLimited(client);
    const data = client.data as VoiceSocketData;
    const transport = data.transports.get(body.transportId);
    if (!transport) throw new Error('Unknown transport');

    const producer = await transport.produce({
      kind: body.kind,
      rtpParameters: body.rtpParameters as never,
    });
    data.producers.set(producer.id, producer);

    await this.sfu.registerProducer(data.roomKey, producer, {
      producerId: producer.id,
      userId: data.userId,
      userName: data.userName,
      kind: 'audio',
    });

    client.to(this.roomFor(data.roomKey)).emit('newProducer', {
      producerId: producer.id,
      userId: data.userId,
      userName: data.userName,
    });

    if (data.kind === 'guild') {
      // A late joiner (or one who re-produces after a reconnect) must come in
      // silenced if the host already muted them / turned on listen-only.
      if (this.isHostMuted(data.roomKey, data)) {
        await producer.pause().catch(() => undefined);
      }
      void this.broadcastVoiceState(data.roomKey);
    }

    return { id: producer.id };
  }

  @SubscribeMessage('consume')
  async onConsume(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      transportId: string;
      producerId: string;
      rtpCapabilities: unknown;
    },
  ) {
    this.assertNotRateLimited(client);
    const data = client.data as VoiceSocketData;
    const transport = data.transports.get(body.transportId);
    if (!transport) throw new Error('Unknown transport');

    const room = await this.sfu.getOrCreateRoom(data.roomKey);
    const rtpCapabilities = body.rtpCapabilities as never;
    if (!room.router.canConsume({ producerId: body.producerId, rtpCapabilities })) {
      throw new Error('Cannot consume this producer');
    }

    const consumer = await transport.consume({
      producerId: body.producerId,
      rtpCapabilities,
      paused: true,
    });
    data.consumers.set(consumer.id, consumer);

    return {
      id: consumer.id,
      producerId: body.producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    };
  }

  @SubscribeMessage('resumeConsumer')
  async onResumeConsumer(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { consumerId: string },
  ) {
    this.assertNotRateLimited(client);
    const data = client.data as VoiceSocketData;
    const consumer = data.consumers.get(body.consumerId);
    await consumer?.resume();
    return { resumed: true };
  }

  @SubscribeMessage('setHandRaised')
  onSetHandRaised(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { raised: boolean },
  ) {
    this.assertNotRateLimited(client);
    const data = client.data as VoiceSocketData;
    const raised = !!body?.raised;
    let hands = this.raisedHands.get(data.roomKey);
    if (!hands) {
      hands = new Set();
      this.raisedHands.set(data.roomKey, hands);
    }
    if (raised) hands.add(data.userId);
    else hands.delete(data.userId);
    client
      .to(this.roomFor(data.roomKey))
      .emit('handRaised', { userId: data.userId, raised });
    return { raised };
  }

  /** Current host-mute state; joiners call this once after connecting. */
  @SubscribeMessage('getVoiceState')
  async onGetVoiceState(@ConnectedSocket() client: Socket) {
    this.assertNotRateLimited(client);
    const data = client.data as VoiceSocketData;
    const sockets = await this.server.in(this.roomFor(data.roomKey)).fetchSockets();
    return {
      ...this.buildVoiceState(data.roomKey, sockets),
      userId: data.userId,
      canModerate: data.canModerate,
    };
  }

  /** Moderator: everyone but moderators goes listen-only. */
  @SubscribeMessage('muteAll')
  async onMuteAll(@ConnectedSocket() client: Socket) {
    const data = this.assertModerator(client);
    const state = this.guildState(data.roomKey);
    state.listenOnly = true;
    state.hostMuted.clear();
    state.speakers.clear();
    await this.broadcastVoiceState(data.roomKey);
    return { ok: true };
  }

  /** Moderator: lifts listen-only and every individual mute. */
  @SubscribeMessage('unmuteAll')
  async onUnmuteAll(@ConnectedSocket() client: Socket) {
    const data = this.assertModerator(client);
    const state = this.guildState(data.roomKey);
    state.listenOnly = false;
    state.hostMuted.clear();
    state.speakers.clear();
    await this.broadcastVoiceState(data.roomKey);
    return { ok: true };
  }

  /** Moderator: mute / unmute one person (works inside or outside listen-only). */
  @SubscribeMessage('muteUser')
  async onMuteUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { userId: string; muted: boolean },
  ) {
    const data = this.assertModerator(client);
    const targetId = body?.userId;
    if (!targetId || typeof body.muted !== 'boolean') {
      throw new Error('Invalid mute request');
    }
    const sockets = await this.server.in(this.roomFor(data.roomKey)).fetchSockets();
    const target = sockets.find(
      (s) => (s.data as Partial<VoiceSocketData>)?.userId === targetId,
    );
    if (!target) throw new Error('That person is not in the voice room');
    if ((target.data as VoiceSocketData).canModerate) {
      throw new Error('Hosts cannot be muted');
    }

    const state = this.guildState(data.roomKey);
    if (body.muted) {
      state.speakers.delete(targetId);
      state.hostMuted.add(targetId);
    } else {
      state.hostMuted.delete(targetId);
      if (state.listenOnly) state.speakers.add(targetId);
    }
    await this.broadcastVoiceState(data.roomKey);
    return { ok: true };
  }

  /**
   * Org owner / coach only. Enforced here, not just hidden in the UI: the
   * target's media is closed and its socket dropped, so a modified client
   * can neither kick others nor ignore being kicked.
   */
  @SubscribeMessage('kick')
  async onKick(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { userId: string },
  ) {
    this.assertNotRateLimited(client);
    const data = client.data as VoiceSocketData;
    const targetId = body?.userId;
    if (!targetId || targetId === data.userId) {
      throw new Error('Invalid kick target');
    }
    const allowed =
      data.kind === 'guild'
        ? data.canModerate
        : await this.membershipService.hasEditAccess(data.userId, data.orgId);
    if (!allowed) {
      throw new Error(
        data.kind === 'guild'
          ? 'Only the owner or guild leaders can remove people'
          : 'Only the org owner or a coach can kick',
      );
    }

    const sockets = await this.server.in(this.roomFor(data.roomKey)).fetchSockets();
    let kicked = 0;
    for (const s of sockets) {
      if ((s.data as Partial<VoiceSocketData>)?.userId !== targetId) continue;
      s.emit('kicked', { by: data.userName });
      s.disconnect(true); // handleDisconnect closes its media + notifies the room
      kicked += 1;
    }
    return { kicked };
  }

  private assertModerator(client: Socket): VoiceSocketData {
    this.assertNotRateLimited(client);
    const data = client.data as VoiceSocketData;
    if (data.kind !== 'guild' || !data.canModerate) {
      throw new Error('Only the owner or guild leaders can do that');
    }
    return data;
  }

  /**
   * Max 50 people at once. A second connection by someone already inside
   * (stale socket after a reconnect, or another device) replaces the old one
   * instead of counting twice.
   */
  private async assertGuildCapacity(roomKey: string, userId: string) {
    const sockets = await this.server.in(this.roomFor(roomKey)).fetchSockets();
    const others = new Set<string>();
    for (const s of sockets) {
      const id = (s.data as Partial<VoiceSocketData>)?.userId;
      if (!id) continue;
      if (id === userId) {
        s.emit('kicked', { by: 'another device' });
        s.disconnect(true);
      } else {
        others.add(id);
      }
    }
    if (others.size >= GUILD_VOICE_MAX_PARTICIPANTS) {
      throw new Error(
        `Guild voice is full (${GUILD_VOICE_MAX_PARTICIPANTS} people max). Try again in a bit.`,
      );
    }
  }

  private guildState(roomKey: string): GuildRoomState {
    let state = this.guildRooms.get(roomKey);
    if (!state) {
      state = { listenOnly: false, hostMuted: new Set(), speakers: new Set() };
      this.guildRooms.set(roomKey, state);
    }
    return state;
  }

  private isHostMuted(roomKey: string, data: VoiceSocketData): boolean {
    if (data.kind !== 'guild' || data.canModerate) return false;
    const state = this.guildRooms.get(roomKey);
    if (!state) return false;
    if (state.hostMuted.has(data.userId)) return true;
    return state.listenOnly && !state.speakers.has(data.userId);
  }

  private buildVoiceState(roomKey: string, sockets: Array<{ data: unknown }>) {
    const mutedIds: string[] = [];
    const moderatorIds: string[] = [];
    const users = new Set<string>();
    for (const s of sockets) {
      const d = s.data as Partial<VoiceSocketData>;
      if (!d?.userId) continue;
      users.add(d.userId);
      if (d.canModerate) moderatorIds.push(d.userId);
      else if (this.isHostMuted(roomKey, d as VoiceSocketData)) mutedIds.push(d.userId);
    }
    return {
      listenOnly: this.guildRooms.get(roomKey)?.listenOnly ?? false,
      mutedIds,
      moderatorIds,
      count: users.size,
      max: GUILD_VOICE_MAX_PARTICIPANTS,
    };
  }

  /**
   * Pushes the mute state to every client and enforces it on the server:
   * a host-muted user's producer is paused here, so even a modified client
   * that ignores the "muted" flag cannot be heard.
   */
  private async broadcastVoiceState(roomKey: string) {
    try {
      const room = this.roomFor(roomKey);
      const sockets = await this.server.in(room).fetchSockets();
      for (const s of sockets) {
        const d = s.data as Partial<VoiceSocketData>;
        if (typeof d?.producers?.values !== 'function') continue;
        const muted = this.isHostMuted(roomKey, d as VoiceSocketData);
        for (const producer of d.producers.values()) {
          if (muted && !producer.paused) await producer.pause();
          if (!muted && producer.paused) await producer.resume();
        }
      }
      this.server.to(room).emit('voiceState', this.buildVoiceState(roomKey, sockets));
    } catch (err) {
      this.logger.warn(`broadcastVoiceState failed: ${(err as Error).message}`);
    }
  }

  /** Never leave a room muted with nobody left who can unmute it. */
  private async afterGuildLeave(
    data: VoiceSocketData,
    remaining: Array<{ data: unknown }>,
  ) {
    if (remaining.length === 0) {
      this.guildRooms.delete(data.roomKey);
      return;
    }
    const state = this.guildRooms.get(data.roomKey);
    if (!state) return;
    // hostMuted / speakers are kept on purpose: leaving and rejoining must
    // not be a way around a mute. They reset when the room empties.
    const hostLeft = remaining.every(
      (s) => !(s.data as Partial<VoiceSocketData>)?.canModerate,
    );
    if (hostLeft) {
      state.listenOnly = false;
      state.hostMuted.clear();
      state.speakers.clear();
    }
    await this.broadcastVoiceState(data.roomKey);
  }

  private roomFor(orgId: string) {
    return `voice:${orgId}`;
  }
}
