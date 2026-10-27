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
import { MediasoupSfuService } from './mediasoup-sfu.service';

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
  cors: { origin: process.env.CORS_ORIGIN ?? '*' },
})
export class VoiceGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(VoiceGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    // Reused only for its org-lookup helper — chat and voice both scope to "your org".
    private readonly chatService: ChatService,
    private readonly sfu: MediasoupSfuService,
  ) {}

  afterInit(server: Server) {
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

    for (const producer of data.producers.values()) {
      this.sfu.unregisterProducer(data.orgId, producer.id);
      this.server
        .to(this.roomFor(data.orgId))
        .emit('producerClosed', { producerId: producer.id });
    }
    for (const transport of data.transports.values()) {
      transport.close();
    }

    this.server
      .to(this.roomFor(data.orgId))
      .emit('peerLeft', { userId: data.userId });
  }

  @SubscribeMessage('getRtpCapabilities')
  async onGetRtpCapabilities(@ConnectedSocket() client: Socket) {
    const data = client.data as VoiceSocketData;
    const room = await this.sfu.getOrCreateRoom(data.orgId);
    return room.router.rtpCapabilities;
  }

  @SubscribeMessage('getProducers')
  onGetProducers(@ConnectedSocket() client: Socket) {
    const data = client.data as VoiceSocketData;
    return this.sfu
      .listProducers(data.orgId)
      .filter((p) => p.userId !== data.userId);
  }

  @SubscribeMessage('createTransport')
  async onCreateTransport(@ConnectedSocket() client: Socket) {
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
    const data = client.data as VoiceSocketData;
    const transport = data.transports.get(body.transportId);
    if (!transport) throw new Error('Unknown transport');

    const producer = await transport.produce({
      kind: body.kind,
      rtpParameters: body.rtpParameters as never,
    });
    data.producers.set(producer.id, producer);

    this.sfu.registerProducer(data.orgId, {
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
    const data = client.data as VoiceSocketData;
    const consumer = data.consumers.get(body.consumerId);
    await consumer?.resume();
    return { resumed: true };
  }

  private roomFor(orgId: string) {
    return `voice:${orgId}`;
  }
}
