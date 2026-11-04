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
import { SendMessageDto } from './dto/send-message.dto';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { WsRateLimiter } from '../common/ws-rate-limiter';

interface SocketData {
  userId: string;
  userName: string;
  orgId: string;
}

@WebSocketGateway({ cors: { origin: process.env.CORS_ORIGIN ?? '*' } })
export class ChatGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  // Generous enough for real chat use (bursts of quick messages, pasting a
  // few links) while stopping a flood — per socket, not per org, so one
  // abusive connection can't drown out the rest of the room's budget.
  private readonly messageLimiter = new WsRateLimiter(20, 10_000);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
  ) {}

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
        next();
      } catch (err) {
        this.logger.warn(`Rejected socket connection: ${(err as Error).message}`);
        next(err as Error);
      }
    });
  }

  handleDisconnect(client: Socket) {
    // socket.io removes room membership automatically on disconnect.
    this.messageLimiter.clear(client.id);
  }

  @SubscribeMessage('channel:join')
  async onChannelJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelKey?: string },
  ) {
    const data = client.data as SocketData;
    if (!data?.orgId) return;
    const channelKey = body?.channelKey?.trim() || ORG_CHANNEL;
    await this.chatService.assertChannelAccess(data.userId, data.orgId, channelKey);
    await client.join(this.roomFor(data.orgId, channelKey));
    return { ok: true, channelKey };
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
    const { lastReadAt } = await this.chatService.markRead(data.userId, channelKey);
    this.server.to(this.roomFor(data.orgId, channelKey)).emit('chat:read', {
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
    this.server.to(this.roomFor(data.orgId, channelKey)).emit('chat:delivered', {
      userId: data.userId,
      userName: data.userName,
      channelKey,
      lastDeliveredAt,
    });
  }

  @SubscribeMessage('message:send')
  async onMessageSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: SendMessageDto,
  ) {
    const data = client.data as SocketData;
    if (!data?.orgId) return;
    if (!this.messageLimiter.allow(client.id)) return;

    const channelKey = body?.channelKey?.trim() || ORG_CHANNEL;
    const text = (body?.text ?? '').trim();
    if (text.length > 2000) return;
    if (!text && !body?.mediaUrl) return;

    const { orgId, message } = await this.chatService.createMessage(
      data.userId,
      data.userName,
      {
        channelKey,
        text: text || undefined,
        mediaUrl: body.mediaUrl,
        mediaType: body.mediaType,
      },
    );

    // Ensure sender is in the room, then broadcast.
    await client.join(this.roomFor(orgId, channelKey));
    this.server.to(this.roomFor(orgId, channelKey)).emit('message:new', message);

    // Also nudge org room so inbox unread badges refresh for group.
    if (channelKey === ORG_CHANNEL) {
      this.server.to(this.roomFor(orgId, ORG_CHANNEL)).emit('chat:unread', {
        channelKey,
      });
    } else {
      this.server.to(this.roomFor(orgId, channelKey)).emit('chat:unread', {
        channelKey,
      });
    }
  }

  private roomFor(orgId: string, channelKey: string) {
    return `org:${orgId}:ch:${channelKey}`;
  }
}
