import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from '../chat/chat.service';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { PushNotificationService } from '../common/push-notification.service';
import { WsRateLimiter } from '../common/ws-rate-limiter';
import { corsOrigin } from '../common/cors-origin';
import { GAME_CATALOG, GameKind, GamesService, RoomView } from './games.service';

interface GamesSocketData {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  orgId: string;
}

type Ack<T> = { ok: true; room: T } | { ok: false; error: string };

/**
 * Socket.IO namespace `/games`: lobby + live game actions for the in-app
 * Games section. All state lives in GamesService; this layer only does
 * auth, routing, and fan-out.
 *
 * Client → server (all acked):
 *   room:list                       → RoomView[]
 *   room:create {game, maxPlayers}  → RoomView
 *   room:join {roomId}              → RoomView
 *   room:leave                      → { ok }
 *   room:start {roomId}             → RoomView
 *   room:rematch {roomId}           → RoomView
 *   room:invite {roomId, userId}    → { ok }
 *   rps:pick {roomId, choice}       → RoomView
 *   ludo:roll {roomId}              → RoomView
 *   ludo:move {roomId, tokenIndex}  → RoomView
 * Server → client:
 *   room:update {room, event?}   every change in a room you're in
 *   rooms:changed                lobby list for your org changed
 *   room:invite {room, from}     someone invited you
 */
@WebSocketGateway({ namespace: 'games', cors: { origin: corsOrigin() } })
export class GamesGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(GamesGateway.name);
  private readonly limiter = new WsRateLimiter(60, 10_000);
  /** userId -> live socket ids (a user may have the app open on two devices). */
  private readonly userSockets = new Map<string, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
    private readonly push: PushNotificationService,
    private readonly games: GamesService,
  ) {}

  afterInit(server: Server) {
    this.games.setListeners(
      (room, event) => {
        server.to(this.roomChannel(room.id)).emit('room:update', { room, event: event ?? null });
      },
      (orgId) => {
        server.to(this.orgChannel(orgId)).emit('rooms:changed');
      },
    );

    server.use(async (socket: Socket, next) => {
      try {
        const token = socket.handshake.auth?.token as string | undefined;
        if (!token) throw new Error('No token provided');
        const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
        const user = await this.prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
        if (user.tokenVersion !== payload.tokenVersion) {
          throw new Error('Session has been logged out');
        }
        const ctx = await this.chatService.getChatContext(payload.sub);
        const data: GamesSocketData = {
          userId: user.id,
          userName: user.name,
          avatarUrl: user.avatarUrl ?? null,
          orgId: ctx.orgId,
        };
        socket.data = data;
        await socket.join(this.orgChannel(ctx.orgId));
        await socket.join(this.userChannel(user.id));
        next();
      } catch (err) {
        this.logger.warn(`Rejected games connection: ${(err as Error).message}`);
        next(err as Error);
      }
    });

    server.on('connection', async (socket: Socket) => {
      const data = socket.data as GamesSocketData;
      if (!data?.userId) return;
      let set = this.userSockets.get(data.userId);
      if (!set) this.userSockets.set(data.userId, (set = new Set()));
      set.add(socket.id);
      // Coming back to a room we were in (app reopened / network blip).
      const room = this.games.markConnected(data.userId);
      if (room) {
        await socket.join(this.roomChannel(room.id));
        socket.emit('room:update', { room, event: { type: 'resumed' } });
      }
    });
  }

  handleDisconnect(client: Socket) {
    this.limiter.clear(client.id);
    const data = client.data as Partial<GamesSocketData>;
    if (!data?.userId) return;
    const set = this.userSockets.get(data.userId);
    set?.delete(client.id);
    if (!set || set.size === 0) {
      this.userSockets.delete(data.userId);
      this.games.markDisconnected(data.userId);
    }
  }

  private guard(client: Socket): GamesSocketData {
    if (!this.limiter.allow(client.id)) throw new Error('Too many requests — slow down');
    const data = client.data as GamesSocketData;
    if (!data?.orgId) throw new Error('Not connected');
    return data;
  }

  private async run<T>(client: Socket, fn: (data: GamesSocketData) => Promise<T> | T): Promise<Ack<T>> {
    try {
      const data = this.guard(client);
      return { ok: true, room: await fn(data) };
    } catch (err) {
      return { ok: false, error: (err as Error).message || 'Something went wrong' };
    }
  }

  @SubscribeMessage('room:list')
  onList(@ConnectedSocket() client: Socket) {
    return this.run(client, (data) => this.games.listRooms(data.orgId));
  }

  @SubscribeMessage('room:current')
  onCurrent(@ConnectedSocket() client: Socket) {
    return this.run(client, (data) => this.games.roomOf(data.userId));
  }

  @SubscribeMessage('room:create')
  onCreate(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { game?: GameKind; maxPlayers?: number },
  ) {
    return this.run(client, async (data) => {
      const game = body?.game;
      if (!game || !GAME_CATALOG[game]) throw new Error('Pick a game');
      const room = this.games.createRoom(
        data.orgId,
        { userId: data.userId, name: data.userName, avatarUrl: data.avatarUrl },
        game,
        body?.maxPlayers,
      );
      await this.rejoinSocketsOf(data.userId, room.id);
      return room;
    });
  }

  @SubscribeMessage('room:join')
  onJoin(@ConnectedSocket() client: Socket, @MessageBody() body: { roomId?: string }) {
    return this.run(client, async (data) => {
      if (!body?.roomId) throw new Error('roomId is required');
      const room = this.games.joinRoom(body.roomId, data.orgId, {
        userId: data.userId,
        name: data.userName,
        avatarUrl: data.avatarUrl,
      });
      await this.rejoinSocketsOf(data.userId, room.id);
      return room;
    });
  }

  @SubscribeMessage('room:leave')
  onLeave(@ConnectedSocket() client: Socket) {
    return this.run(client, async (data) => {
      const current = this.games.roomOf(data.userId);
      this.games.leaveRoom(data.userId);
      if (current) await this.leaveSocketsOf(data.userId, current.id);
      return null;
    });
  }

  @SubscribeMessage('room:start')
  onStart(@ConnectedSocket() client: Socket, @MessageBody() body: { roomId?: string }) {
    return this.run(client, (data) => this.games.startGame(this.roomIdOf(body, data), data.userId));
  }

  @SubscribeMessage('room:rematch')
  onRematch(@ConnectedSocket() client: Socket, @MessageBody() body: { roomId?: string }) {
    return this.run(client, (data) => this.games.rematch(this.roomIdOf(body, data), data.userId));
  }

  @SubscribeMessage('room:invite')
  onInvite(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { roomId?: string; userId?: string },
  ) {
    return this.run(client, async (data) => {
      const room = this.games.roomOf(data.userId);
      if (!room || room.id !== (body?.roomId ?? room.id)) throw new Error('You are not in that room');
      const targetId = body?.userId?.trim();
      if (!targetId || targetId === data.userId) throw new Error('Pick a teammate to invite');
      const target = await this.prisma.user.findUnique({
        where: { id: targetId },
        select: { id: true, expoPushToken: true },
      });
      if (!target) throw new Error('Teammate not found');
      // Same-org check: the target must resolve to this org.
      const ctx = await this.chatService.getChatContext(targetId).catch(() => null);
      if (!ctx || ctx.orgId !== data.orgId) throw new Error('Teammate is not in your org');

      this.server.to(this.userChannel(targetId)).emit('room:invite', {
        room,
        from: { userId: data.userId, name: data.userName },
      });
      if (this.push.isValidExpoPushToken(target.expoPushToken)) {
        await this.push
          .send([
            {
              to: target.expoPushToken,
              title: `${data.userName} invited you to play`,
              body: `${room.title} — tap to join`,
              data: { type: 'game_invite', roomId: room.id, game: room.game },
              collapseId: `game-invite:${room.id}:${targetId}`,
              channelId: 'chat',
            },
          ])
          .catch((err) => this.logger.warn(`invite push failed: ${(err as Error).message}`));
      }
      return null;
    });
  }

  @SubscribeMessage('rps:pick')
  onRpsPick(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { roomId?: string; choice?: string },
  ) {
    return this.run(client, (data) =>
      this.games.rpsPick(this.roomIdOf(body, data), data.userId, body?.choice),
    );
  }

  @SubscribeMessage('ludo:roll')
  onLudoRoll(@ConnectedSocket() client: Socket, @MessageBody() body: { roomId?: string }) {
    return this.run(client, (data) => this.games.ludoRoll(this.roomIdOf(body, data), data.userId));
  }

  @SubscribeMessage('ludo:move')
  onLudoMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { roomId?: string; tokenIndex?: number },
  ) {
    return this.run(client, (data) =>
      this.games.ludoMove(this.roomIdOf(body, data), data.userId, Number(body?.tokenIndex)),
    );
  }

  private roomIdOf(body: { roomId?: string } | undefined, data: GamesSocketData): string {
    const id = body?.roomId?.trim() || this.games.roomOf(data.userId)?.id;
    if (!id) throw new Error('You are not in a room');
    return id;
  }

  private async rejoinSocketsOf(userId: string, roomId: string) {
    const sockets = await this.server.in(this.userChannel(userId)).fetchSockets();
    await Promise.all(sockets.map((s) => s.join(this.roomChannel(roomId))));
  }

  private async leaveSocketsOf(userId: string, roomId: string) {
    const sockets = await this.server.in(this.userChannel(userId)).fetchSockets();
    await Promise.all(sockets.map((s) => s.leave(this.roomChannel(roomId))));
  }

  private roomChannel(roomId: string) {
    return `game:${roomId}`;
  }
  private orgChannel(orgId: string) {
    return `games-org:${orgId}`;
  }
  private userChannel(userId: string) {
    return `games-user:${userId}`;
  }
}

export type { RoomView };
