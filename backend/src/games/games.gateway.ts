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
import { PushMessage, PushNotificationService } from '../common/push-notification.service';
import { WsRateLimiter } from '../common/ws-rate-limiter';
import { corsOrigin } from '../common/cors-origin';
import { GAME_CATALOG, GameKind, GamesService, RoomView } from './games.service';

/** One user may notify one specific teammate at most once per this window. */
const NOTIFY_COOLDOWN_MS = 5 * 60 * 1000;
/** Hard cap on a single "notify all" blast. */
const MAX_NOTIFY_ALL = 100;

/** An invite queued for an offline user is dropped after this long. */
const PENDING_INVITE_TTL_MS = 30 * 60 * 1000;

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
 *   room:members                    → [{ userId, name, avatarUrl }] (invite pool)
 *   room:invite {roomId, userId}    → { ok }  (same sender→target: once per 5 min)
 *   room:invite-all {roomId}        → { sentIds, skippedIds, total }
 *   rps:pick {roomId, choice}       → RoomView
 *   ludo:roll {roomId}              → RoomView
 *   ludo:move {roomId, tokenIndex}  → RoomView
 * Server → client:
 *   room:update {room, event?}   every change in a room you're in
 *   rooms:changed                lobby list for your org changed
 *   room:invite {room, from}     someone invited you (queued + sent on connect if you were offline)
 */
@WebSocketGateway({ namespace: 'games', cors: { origin: corsOrigin() } })
export class GamesGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(GamesGateway.name);
  private readonly limiter = new WsRateLimiter(60, 10_000);
  /** userId -> live socket ids (a user may have the app open on two devices). */
  private readonly userSockets = new Map<string, Set<string>>();
  /**
   * Invites for users who were offline when invited: userId -> pending invites.
   * Delivered the moment they connect (the push notification covers the
   * "device is away" case; this covers the in-app alert on next open).
   */
  /** `${fromUserId}:${targetUserId}` -> last notify time (ms), for the 5-min cooldown. */
  private readonly lastNotified = new Map<string, number>();
  private readonly pendingInvites = new Map<
    string,
    Array<{ roomId: string; fromUserId: string; fromName: string; at: number }>
  >();

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
      this.flushPendingInvites(data.userId, socket);
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

  /** Deliver invites that arrived while this user was offline (still-open rooms only). */
  private flushPendingInvites(userId: string, socket: Socket) {
    const pending = this.pendingInvites.get(userId);
    if (!pending?.length) return;
    this.pendingInvites.delete(userId);
    const now = Date.now();
    for (const inv of pending) {
      if (now - inv.at > PENDING_INVITE_TTL_MS) continue;
      const room = this.games.roomViewById(inv.roomId);
      if (!room || room.status !== 'lobby') continue;
      if (room.players.some((p) => p.userId === userId)) continue;
      socket.emit('room:invite', {
        room,
        from: { userId: inv.fromUserId, name: inv.fromName },
      });
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

  /** Everyone in this org (roster + guild-only), minus the caller — the invite pool. */
  private async orgCandidates(orgId: string, selfId: string) {
    const [roster, guild] = await Promise.all([
      this.prisma.membership.findMany({
        where: { orgId },
        select: { user: { select: { id: true, name: true, avatarUrl: true, expoPushToken: true } } },
      }),
      this.prisma.guildMembership.findMany({
        where: { orgId },
        select: { user: { select: { id: true, name: true, avatarUrl: true, expoPushToken: true } } },
      }),
    ]);
    const byId = new Map<
      string,
      { id: string; name: string; avatarUrl: string | null; expoPushToken: string | null }
    >();
    for (const row of [...roster, ...guild]) {
      if (row.user.id !== selfId) byId.set(row.user.id, row.user);
    }
    return [...byId.values()];
  }

  /** Remaining cooldown (ms) before `fromId` may notify `targetId` again; 0 = allowed now. */
  private notifyCooldownLeft(fromId: string, targetId: string): number {
    const last = this.lastNotified.get(`${fromId}:${targetId}`);
    if (!last) return 0;
    return Math.max(0, last + NOTIFY_COOLDOWN_MS - Date.now());
  }

  private pruneNotifyLog() {
    if (this.lastNotified.size < 500) return;
    const cutoff = Date.now() - NOTIFY_COOLDOWN_MS;
    for (const [k, at] of this.lastNotified) if (at < cutoff) this.lastNotified.delete(k);
  }

  /** Live event + offline queue + push for one target. Caller has already validated + rate-limited. */
  private deliverInvite(
    data: GamesSocketData,
    room: RoomView,
    target: { id: string; expoPushToken: string | null },
  ): PushMessage | null {
    this.lastNotified.set(`${data.userId}:${target.id}`, Date.now());
    this.server.to(this.userChannel(target.id)).emit('room:invite', {
      room,
      from: { userId: data.userId, name: data.userName },
    });
    // Offline right now → hold the invite and hand it over when they connect.
    if (!this.userSockets.get(target.id)?.size) {
      const queue = (this.pendingInvites.get(target.id) ?? []).filter((i) => i.roomId !== room.id);
      queue.push({
        roomId: room.id,
        fromUserId: data.userId,
        fromName: data.userName,
        at: Date.now(),
      });
      this.pendingInvites.set(target.id, queue.slice(-10));
    }
    return this.push.isValidExpoPushToken(target.expoPushToken)
      ? {
          to: target.expoPushToken as string,
          title: `${data.userName} invited you to play`,
          body: `${room.title} — tap to join`,
          data: { type: 'game_invite', roomId: room.id, game: room.game },
          collapseId: `game-invite:${room.id}:${target.id}`,
          channelId: 'chat',
        }
      : null;
  }

  private sendPushes(messages: Array<PushMessage | null>) {
    const list = messages.filter((m): m is PushMessage => !!m);
    if (!list.length) return Promise.resolve();
    return this.push
      .send(list)
      .catch((err) => this.logger.warn(`invite push failed: ${(err as Error).message}`));
  }

  @SubscribeMessage('room:members')
  onMembers(@ConnectedSocket() client: Socket) {
    return this.run(client, async (data) => {
      const list = await this.orgCandidates(data.orgId, data.userId);
      return list
        .map((u) => ({ userId: u.id, name: u.name, avatarUrl: u.avatarUrl ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name));
    });
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
        select: { id: true, name: true, expoPushToken: true },
      });
      if (!target) throw new Error('Teammate not found');
      // Same-org check: the target must resolve to this org.
      const ctx = await this.chatService.getChatContext(targetId).catch(() => null);
      if (!ctx || ctx.orgId !== data.orgId) throw new Error('Teammate is not in your org');

      const left = this.notifyCooldownLeft(data.userId, targetId);
      if (left > 0) {
        throw new Error(
          `You already notified ${target.name}. Try again in ${Math.ceil(left / 60_000)} min.`,
        );
      }
      this.pruneNotifyLog();
      await this.sendPushes([this.deliverInvite(data, room, target)]);
      return null;
    });
  }

  /**
   * "Notify all": invite every teammate who isn't in the room yet, skipping
   * anyone this user already notified within the cooldown window.
   */
  @SubscribeMessage('room:invite-all')
  onInviteAll(@ConnectedSocket() client: Socket, @MessageBody() body: { roomId?: string }) {
    return this.run(client, async (data) => {
      const room = this.games.roomOf(data.userId);
      if (!room || room.id !== (body?.roomId ?? room.id)) throw new Error('You are not in that room');
      if (room.status !== 'lobby') throw new Error('Game already started');
      const inRoom = new Set(room.players.map((p) => p.userId));
      const candidates = (await this.orgCandidates(data.orgId, data.userId)).filter(
        (u) => !inRoom.has(u.id),
      );
      this.pruneNotifyLog();
      const sentIds: string[] = [];
      const skippedIds: string[] = [];
      const pushes: Array<PushMessage | null> = [];
      for (const u of candidates.slice(0, MAX_NOTIFY_ALL)) {
        if (this.notifyCooldownLeft(data.userId, u.id) > 0) {
          skippedIds.push(u.id);
          continue;
        }
        pushes.push(this.deliverInvite(data, room, u));
        sentIds.push(u.id);
      }
      await this.sendPushes(pushes);
      return { sentIds, skippedIds, total: candidates.length };
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
