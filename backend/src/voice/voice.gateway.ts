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
import { WsRateLimiter } from '../common/ws-rate-limiter';
import { corsOrigin } from '../common/cors-origin';

interface VoiceSocketData {
  userId: string;
  userName: string;
  orgId: string;
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
        const orgId = await this.chatService.getOrgIdForUser(payload.sub);

        const data: VoiceSocketData = {
          userId: user.id,
          userName: user.name,
          orgId,
          transports: new Map(),
          producers: new Map(),
          consumers: new Map(),
        };
        socket.data = data;
        await socket.join(this.roomFor(orgId));
        await this.sfu.getOrCreateRoom(orgId);
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
    const room = this.roomFor(data.orgId);

    this.closeMedia(data);
    for (const producerId of data.producers.keys()) {
      this.server.to(room).emit('producerClosed', { producerId });
    }
    data.producers.clear();

    const hands = this.raisedHands.get(data.orgId);
    if (hands?.delete(data.userId)) {
      this.server.to(room).emit('handRaised', { userId: data.userId, raised: false });
      if (hands.size === 0) this.raisedHands.delete(data.orgId);
    }

    this.server.to(room).emit('peerLeft', { userId: data.userId });
    this.signalingLimiter.clear(client.id);

    // Tear the router down once the last peer is gone.
    try {
      const remaining = await this.server.in(room).fetchSockets();
      this.sfu.closeRoomIfEmpty(data.orgId, remaining.length);
    } catch (err) {
      this.logger.warn(`fetchSockets failed on disconnect: ${(err as Error).message}`);
    }
  }

  /** Closes every mediasoup object this socket owns (transports close producers/consumers too). */
  private closeMedia(data: VoiceSocketData) {
    for (const producer of data.producers.values()) {
      this.sfu.unregisterProducer(data.orgId, producer.id);
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
    const room = await this.sfu.getOrCreateRoom(data.orgId);
    return room.router.rtpCapabilities;
  }

  @SubscribeMessage('getProducers')
  onGetProducers(@ConnectedSocket() client: Socket) {
    this.assertNotRateLimited(client);
    const data = client.data as VoiceSocketData;
    const hands = this.raisedHands.get(data.orgId);
    return this.sfu
      .listProducers(data.orgId)
      .filter((p) => p.userId !== data.userId)
      .map((p) => ({ ...p, handRaised: hands?.has(p.userId) ?? false }));
  }

  @SubscribeMessage('createTransport')
  async onCreateTransport(@ConnectedSocket() client: Socket) {
    this.assertNotRateLimited(client);
    const data = client.data as VoiceSocketData;
    const transport = await this.sfu.createWebRtcTransport(data.orgId);
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

    await this.sfu.registerProducer(data.orgId, producer, {
      producerId: producer.id,
      userId: data.userId,
      userName: data.userName,
      kind: 'audio',
    });

    client.to(this.roomFor(data.orgId)).emit('newProducer', {
      producerId: producer.id,
      userId: data.userId,
      userName: data.userName,
    });

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

    const room = await this.sfu.getOrCreateRoom(data.orgId);
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
    let hands = this.raisedHands.get(data.orgId);
    if (!hands) {
      hands = new Set();
      this.raisedHands.set(data.orgId, hands);
    }
    if (raised) hands.add(data.userId);
    else hands.delete(data.userId);
    client
      .to(this.roomFor(data.orgId))
      .emit('handRaised', { userId: data.userId, raised });
    return { raised };
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
    const allowed = await this.membershipService.hasEditAccess(
      data.userId,
      data.orgId,
    );
    if (!allowed) throw new Error('Only the org owner or a coach can kick');

    const sockets = await this.server.in(this.roomFor(data.orgId)).fetchSockets();
    let kicked = 0;
    for (const s of sockets) {
      if ((s.data as Partial<VoiceSocketData>)?.userId !== targetId) continue;
      s.emit('kicked', { by: data.userName });
      s.disconnect(true); // handleDisconnect closes its media + notifies the room
      kicked += 1;
    }
    return { kicked };
  }

  private roomFor(orgId: string) {
    return `voice:${orgId}`;
  }
}
