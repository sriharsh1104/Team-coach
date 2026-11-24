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
import { PrismaService } from '../prisma/prisma.service';
import { ChatService, GUILD_CHANNEL, ORG_CHANNEL } from './chat.service';
import { ChatPresenceTracker } from './chat-presence.tracker';
import { SendMessageDto } from './dto/send-message.dto';
import { DeleteMessagesDto } from './dto/delete-messages.dto';
import { EditMessageDto } from './dto/edit-message.dto';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { WsRateLimiter } from '../common/ws-rate-limiter';
import { corsOrigin } from '../common/cors-origin';

interface SocketData {
  userId: string;
  userName: string;
  orgId: string;
}

@WebSocketGateway({ cors: { origin: corsOrigin() } })
export class ChatGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  // Generous enough for real chat use (bursts of quick messages, pasting a
  // few links) while stopping a flood — per socket, not per org, so one
  // abusive connection can't drown out the rest of the room's budget.
  private readonly messageLimiter = new WsRateLimiter(20, 10_000);
  // Typing events fire far more often than messages (every keystroke-ish) —
  // its own, more generous limiter so normal typing never gets throttled.
  private readonly typingLimiter = new WsRateLimiter(60, 10_000);
  // socketId -> channelKeys this socket last said "typing" in, so a dropped
  // connection (crash, kill, airplane mode) still clears the indicator for
  // everyone else instead of leaving "X is typing…" stuck forever.
  private readonly typingChannels = new Map<string, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
    private readonly presence: ChatPresenceTracker,
  ) {}

  /** Used by background jobs (scrim reminders) that post outside a socket. */
  broadcastNewMessage(
    orgId: string,
    channelKey: string,
    message: Record<string, unknown>,
  ) {
    this.server
      .to(this.roomFor(orgId, channelKey))
      .emit('message:new', message);
    this.server.to(this.roomFor(orgId, channelKey)).emit('chat:unread', {
      channelKey,
    });
  }

  /** Soft-delete for everyone — REST and socket paths share this emit. */
  broadcastMessagesDeleted(
    deleted: Array<{ id: string; channelKey: string; orgId: string }>,
  ) {
    if (deleted.length === 0) return;
    const byRoom = new Map<string, { orgId: string; channelKey: string; ids: string[] }>();
    for (const row of deleted) {
      const key = `${row.orgId}::${row.channelKey}`;
      const bucket = byRoom.get(key) ?? {
        orgId: row.orgId,
        channelKey: row.channelKey,
        ids: [],
      };
      bucket.ids.push(row.id);
      byRoom.set(key, bucket);
    }
    for (const { orgId, channelKey, ids } of byRoom.values()) {
      this.server
        .to(this.roomFor(orgId, channelKey))
        .emit('message:deleted', { channelKey, ids });
    }
  }

  afterInit(server: Server) {
    server.use(async (socket: Socket, next) => {
      try {
        const token = socket.handshake.auth?.token as string | undefined;
        if (!token) throw new Error('No token provided');

        const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
        const user = await this.prisma.user.findUniqueOrThrow({
          where: { id: payload.sub },
        });
        if (user.tokenVersion !== payload.tokenVersion) {
          throw new Error('Session has been logged out');
        }
        const ctx = await this.chatService.getChatContext(payload.sub);

        const data: SocketData = {
          userId: user.id,
          userName: user.name,
          orgId: ctx.orgId,
        };
        socket.data = data;
        if (ctx.roster) {
          await socket.join(this.roomFor(ctx.orgId, ORG_CHANNEL));
        }
        await socket.join(this.roomFor(ctx.orgId, GUILD_CHANNEL));
        // Personal room: lets a DM recipient's inbox badge update live even
        // when they haven't opened that DM (so aren't in its channel room).
        await socket.join(this.userRoom(user.id));

        // Online presence: broadcast only on the FIRST device coming online
        // (a second tab/device reconnecting is a no-op for everyone else).
        if (this.presence.markOnline(user.id, socket.id)) {
          this.broadcastPresence(ctx.orgId, user.id, true, null);
        }
        next();
      } catch (err) {
        this.logger.warn(
          `Rejected socket connection: ${(err as Error).message}`,
        );
        next(err as Error);
      }
    });
  }

  handleDisconnect(client: Socket) {
    // socket.io removes room membership automatically on disconnect.
    this.messageLimiter.clear(client.id);
    this.typingLimiter.clear(client.id);
    const data = client.data as SocketData | undefined;
    if (!data?.userId) return;
    this.presence.clearViewing(data.userId);

    // A dropped connection shouldn't leave "X is typing…" stuck for others.
    const typingIn = this.typingChannels.get(client.id);
    if (typingIn) {
      for (const channelKey of typingIn) {
        this.server
          .to(this.roomFor(data.orgId, channelKey))
          .emit('typing:update', {
            channelKey,
            userId: data.userId,
            userName: data.userName,
            typing: false,
          });
      }
      this.typingChannels.delete(client.id);
    }

    // Online presence: only the LAST device disconnecting takes this user
    // offline — record when, so "last seen" has something to show.
    if (this.presence.markOffline(data.userId, client.id)) {
      void this.prisma.user
        .update({
          where: { id: data.userId },
          data: { lastSeenAt: new Date() },
        })
        .then((updated) => {
          this.broadcastPresence(
            data.orgId,
            data.userId,
            false,
            updated.lastSeenAt,
          );
        })
        .catch((err) => {
          this.logger.warn(
            `lastSeenAt update failed for ${data.userId}: ${(err as Error).message}`,
          );
        });
    }
  }

  private broadcastPresence(
    orgId: string,
    userId: string,
    online: boolean,
    lastSeenAt: Date | null,
  ) {
    this.server
      .to([
        this.roomFor(orgId, ORG_CHANNEL),
        this.roomFor(orgId, GUILD_CHANNEL),
      ])
      .emit('presence:update', {
        userId,
        online,
        lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : null,
      });
  }

  /** On-demand online/last-seen for a set of users (e.g. opening a DM or member list). */
  @SubscribeMessage('presence:get')
  async onPresenceGet(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { userIds?: string[] },
  ) {
    const data = client.data as SocketData;
    if (!data?.orgId) return { ok: false as const, error: 'Not connected' };
    const ids = [
      ...new Set(
        (Array.isArray(body?.userIds) ? body.userIds : []).filter(Boolean),
      ),
    ].slice(0, 100);
    if (ids.length === 0) return { ok: true as const, presence: {} };

    const rows = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, lastSeenAt: true },
    });
    const presence: Record<
      string,
      { online: boolean; lastSeenAt: string | null }
    > = {};
    for (const row of rows) {
      presence[row.id] = {
        online: this.presence.isOnline(row.id),
        lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
      };
    }
    return { ok: true as const, presence };
  }

  @SubscribeMessage('channel:join')
  async onChannelJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelKey?: string },
  ) {
    const data = client.data as SocketData;
    if (!data?.orgId) return;
    const channelKey = body?.channelKey?.trim() || ORG_CHANNEL;
    await this.chatService.assertChannelAccess(
      data.userId,
      data.orgId,
      channelKey,
    );
    await client.join(this.roomFor(data.orgId, channelKey));
    // Only the actively-viewed channel suppresses pushes — leave any other
    // channel this socket previously marked as open.
    this.presence.clearViewing(data.userId);
    this.presence.setViewing(data.userId, channelKey);
    return { ok: true, channelKey };
  }

  @SubscribeMessage('channel:leave')
  async onChannelLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelKey?: string },
  ) {
    const data = client.data as SocketData;
    if (!data?.userId) return;
    const channelKey = body?.channelKey?.trim();
    this.presence.clearViewing(data.userId, channelKey || undefined);
    return { ok: true, channelKey: channelKey ?? null };
  }

  // Mirrors onChannelJoin's shape — persists via the same markRead the REST
  // POST /chat/read uses, then broadcasts so everyone else currently
  // viewing this channel sees the "Seen" update live, the same way
  // message:send already broadcasts message:new.
  @SubscribeMessage('channel:read')
  async onChannelRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelKey?: string },
  ) {
    const data = client.data as SocketData;
    if (!data?.orgId) return;
    const channelKey = body?.channelKey?.trim() || ORG_CHANNEL;
    const { lastReadAt } = await this.chatService.markRead(
      data.userId,
      channelKey,
    );
    this.server
      .to(this.receiptRooms(data.orgId, data.userId, channelKey))
      .emit('chat:read', {
        userId: data.userId,
        userName: data.userName,
        channelKey,
        lastReadAt,
      });
  }

  // Mirrors onChannelRead, but for the "delivered" (double grey tick) tier —
  // the client emits this the instant its socket actually receives a
  // channel's messages, separately from (and generally before) channel:read.
  @SubscribeMessage('channel:delivered')
  async onChannelDelivered(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelKey?: string },
  ) {
    const data = client.data as SocketData;
    if (!data?.orgId) return;
    const channelKey = body?.channelKey?.trim() || ORG_CHANNEL;
    const { lastDeliveredAt } = await this.chatService.markDelivered(
      data.userId,
      channelKey,
    );
    this.server
      .to(this.receiptRooms(data.orgId, data.userId, channelKey))
      .emit('chat:delivered', {
        userId: data.userId,
        userName: data.userName,
        channelKey,
        lastDeliveredAt,
      });
  }

  /** Client fires this on every keystroke-ish (debounced client-side); auto-clears on disconnect. */
  @SubscribeMessage('typing:start')
  onTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelKey?: string },
  ) {
    const data = client.data as SocketData;
    if (!data?.orgId) return;
    if (!this.typingLimiter.allow(client.id)) return;
    const channelKey = body?.channelKey?.trim() || ORG_CHANNEL;
    let set = this.typingChannels.get(client.id);
    if (!set) {
      set = new Set();
      this.typingChannels.set(client.id, set);
    }
    set.add(channelKey);
    client.to(this.roomFor(data.orgId, channelKey)).emit('typing:update', {
      channelKey,
      userId: data.userId,
      userName: data.userName,
      typing: true,
    });
  }

  @SubscribeMessage('typing:stop')
  onTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelKey?: string },
  ) {
    const data = client.data as SocketData;
    if (!data?.orgId) return;
    const channelKey = body?.channelKey?.trim() || ORG_CHANNEL;
    this.typingChannels.get(client.id)?.delete(channelKey);
    client.to(this.roomFor(data.orgId, channelKey)).emit('typing:update', {
      channelKey,
      userId: data.userId,
      userName: data.userName,
      typing: false,
    });
  }

  @SubscribeMessage('message:send')
  async onMessageSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: SendMessageDto,
  ) {
    // Returned value = socket.io ack. The mobile app sends media messages
    // with an ack callback so a failed/dropped send shows "retry" on the
    // bubble instead of a bubble that silently never reaches anyone.
    const data = client.data as SocketData;
    if (!data?.orgId) return { ok: false as const, error: 'Not connected' };
    if (!this.messageLimiter.allow(client.id)) {
      return { ok: false as const, error: 'Too many messages — slow down' };
    }

    const channelKey = body?.channelKey?.trim() || ORG_CHANNEL;
    const text = (body?.text ?? '').trim();
    if (text.length > 2000)
      return { ok: false as const, error: 'Message too long' };
    if (!text && !body?.mediaUrl) {
      return { ok: false as const, error: 'Message text or media is required' };
    }
    const clientId = body?.clientId?.trim();

    let orgId: string;
    let message: Awaited<ReturnType<ChatService['createMessage']>>['message'];
    try {
      ({ orgId, message } = await this.chatService.createMessage(
        data.userId,
        data.userName,
        {
          channelKey,
          text: text || undefined,
          mediaUrl: body.mediaUrl,
          mediaType: body.mediaType,
          replyToId: body.replyToId,
        },
      ));
    } catch (err) {
      const error = (err as Error).message || 'Could not send message';
      this.logger.warn(`message:send failed user=${data.userId}: ${error}`);
      return { ok: false as const, error };
    }

    // A sent message implies typing stopped — don't wait for the client's
    // own timer to clear the indicator for everyone else.
    this.typingChannels.get(client.id)?.delete(channelKey);
    client.to(this.roomFor(orgId, channelKey)).emit('typing:update', {
      channelKey,
      userId: data.userId,
      userName: data.userName,
      typing: false,
    });

    // Ensure sender is in the room, then broadcast.
    await client.join(this.roomFor(orgId, channelKey));
    this.server.to(this.roomFor(orgId, channelKey)).emit('message:new', {
      ...message,
      ...(clientId ? { clientId } : {}),
    });

    // Also nudge org room so inbox unread badges refresh for group.
    if (channelKey === ORG_CHANNEL) {
      this.server.to(this.roomFor(orgId, ORG_CHANNEL)).emit('chat:unread', {
        channelKey,
      });
    } else {
      const peerId = this.chatService.parseDmPeer(channelKey, data.userId);
      const rooms = [this.roomFor(orgId, channelKey)];
      if (peerId) rooms.push(this.userRoom(peerId));
      this.server.to(rooms).emit('chat:unread', { channelKey });
    }
    return {
      ok: true as const,
      id: message.id,
      ...(clientId ? { clientId } : {}),
    };
  }

  @SubscribeMessage('message:edit')
  async onMessageEdit(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: EditMessageDto,
  ) {
    const data = client.data as SocketData;
    if (!data?.orgId || !body?.id || !body?.text) return;
    if (!this.messageLimiter.allow(client.id)) return;

    try {
      const { channelKey, message } = await this.chatService.editOwnMessage(
        data.userId,
        body.id,
        body.text,
      );
      this.server
        .to(this.roomFor(data.orgId, channelKey))
        .emit('message:edited', { channelKey, message });
    } catch (err) {
      this.logger.warn(
        `message:edit failed for ${data.userId}: ${(err as Error).message}`,
      );
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('message:delete')
  async onMessageDelete(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: DeleteMessagesDto,
  ) {
    const data = client.data as SocketData;
    if (!data?.orgId || !Array.isArray(body?.ids) || body.ids.length === 0) {
      return;
    }
    if (!this.messageLimiter.allow(client.id)) return;

    const { deleted } = await this.chatService.deleteOwnMessages(
      data.userId,
      body.ids,
    );
    this.broadcastMessagesDeleted(deleted);
  }

  /** Toggle (add/replace/remove) the caller's reaction on one message. */
  @SubscribeMessage('message:react')
  async onMessageReact(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { messageId?: string; emoji?: string },
  ) {
    const data = client.data as SocketData;
    if (!data?.orgId) return { ok: false as const, error: 'Not connected' };
    if (!this.messageLimiter.allow(client.id)) {
      return { ok: false as const, error: 'Too many requests — slow down' };
    }
    if (!body?.messageId || !body?.emoji) {
      return { ok: false as const, error: 'messageId and emoji are required' };
    }
    try {
      const { orgId, channelKey, messageId, reactions } =
        await this.chatService.reactToMessage(
          data.userId,
          body.messageId,
          body.emoji,
        );
      this.server
        .to(this.roomFor(orgId, channelKey))
        .emit('message:reaction', { messageId, reactions });
      return { ok: true as const, reactions };
    } catch (err) {
      return {
        ok: false as const,
        error: (err as Error).message || 'Could not react',
      };
    }
  }

  /** Re-send a message the caller can see into one or more chats they're in. */
  @SubscribeMessage('message:forward')
  async onMessageForward(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { messageId?: string; toChannelKeys?: string[] },
  ) {
    const data = client.data as SocketData;
    if (!data?.orgId) return { ok: false as const, error: 'Not connected' };
    if (!this.messageLimiter.allow(client.id)) {
      return { ok: false as const, error: 'Too many requests — slow down' };
    }
    if (!body?.messageId || !Array.isArray(body?.toChannelKeys)) {
      return {
        ok: false as const,
        error: 'messageId and toChannelKeys are required',
      };
    }
    try {
      const results = await this.chatService.forwardMessage(
        data.userId,
        data.userName,
        body.messageId,
        body.toChannelKeys,
      );
      for (const r of results) {
        if (!r.ok || !r.orgId || !r.message) continue;
        await client.join(this.roomFor(r.orgId, r.channelKey));
        this.server
          .to(this.roomFor(r.orgId, r.channelKey))
          .emit('message:new', r.message);
        if (r.channelKey === ORG_CHANNEL) {
          this.server
            .to(this.roomFor(r.orgId, ORG_CHANNEL))
            .emit('chat:unread', { channelKey: r.channelKey });
        } else {
          const peerId = this.chatService.parseDmPeer(
            r.channelKey,
            data.userId,
          );
          const rooms = [this.roomFor(r.orgId, r.channelKey)];
          if (peerId) rooms.push(this.userRoom(peerId));
          this.server
            .to(rooms)
            .emit('chat:unread', { channelKey: r.channelKey });
        }
      }
      return {
        ok: true as const,
        results: results.map(({ channelKey, ok, error }) => ({
          channelKey,
          ok,
          error,
        })),
      };
    } catch (err) {
      return {
        ok: false as const,
        error: (err as Error).message || 'Could not forward',
      };
    }
  }

  private roomFor(orgId: string, channelKey: string) {
    return `org:${orgId}:ch:${channelKey}`;
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }

  /**
   * Channel room plus (for DMs) the peer's personal room — so the sender's
   * ticks / Message Info update even when they aren't currently joined to the
   * DM channel socket room (e.g. peer ACKed via the shared app socket).
   */
  private receiptRooms(orgId: string, actorUserId: string, channelKey: string) {
    const rooms = [this.roomFor(orgId, channelKey)];
    const peerId = this.chatService.parseDmPeer(channelKey, actorUserId);
    if (peerId) rooms.push(this.userRoom(peerId));
    return rooms;
  }
}
