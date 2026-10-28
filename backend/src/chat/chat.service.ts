import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationService, PushMessage } from '../common/push-notification.service';

const HISTORY_LIMIT = 50;
export const ORG_CHANNEL = 'org';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushNotifications: PushNotificationService,
  ) {}

  async getMembershipForUser(userId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId },
    });
    if (!membership) {
      throw new NotFoundException('You are not part of an org yet');
    }
    return membership;
  }

  async getOrgIdForUser(userId: string): Promise<string> {
    return (await this.getMembershipForUser(userId)).orgId;
  }

  /** Sorted DM channel key so either side resolves the same room. */
  dmChannelKey(userA: string, userB: string): string {
    const [a, b] = [userA, userB].sort();
    return `dm:${a}:${b}`;
  }

  parseDmPeer(channelKey: string, selfId: string): string | null {
    if (!channelKey.startsWith('dm:')) return null;
    const parts = channelKey.split(':');
    if (parts.length !== 3) return null;
    const [, a, b] = parts;
    if (a === selfId) return b;
    if (b === selfId) return a;
    return null;
  }

  async assertChannelAccess(userId: string, orgId: string, channelKey: string) {
    if (channelKey === ORG_CHANNEL) return;
    const peerId = this.parseDmPeer(channelKey, userId);
    if (!peerId) {
      throw new BadRequestException('Invalid channel');
    }
    if (this.dmChannelKey(userId, peerId) !== channelKey) {
      throw new ForbiddenException('Not a member of this DM');
    }
    const peerMembership = await this.prisma.membership.findFirst({
      where: { userId: peerId, orgId },
    });
    if (!peerMembership) {
      throw new NotFoundException('Teammate not found in your org');
    }
  }

  async listChannels(userId: string) {
    const orgId = await this.getOrgIdForUser(userId);
    const members = await this.prisma.membership.findMany({
      where: { orgId, userId: { not: userId } },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { user: { name: 'asc' } },
    });

    const groupUnread = await this.countUnread(userId, orgId, ORG_CHANNEL);
    const groupLast = await this.lastMessage(orgId, ORG_CHANNEL);

    const dms = await Promise.all(
      members.map(async (m) => {
        const channelKey = this.dmChannelKey(userId, m.userId);
        const unreadCount = await this.countUnread(userId, orgId, channelKey);
        const last = await this.lastMessage(orgId, channelKey);
        return {
          channelKey,
          type: 'DM' as const,
          title: m.user.name,
          peerUserId: m.user.id,
          peerAvatarUrl: m.user.avatarUrl,
          unreadCount,
          lastMessageAt: last?.createdAt ?? null,
          lastPreview: last ? this.preview(last) : null,
        };
      }),
    );

    // Only surface DMs that already have messages, plus always show group.
    const activeDms = dms.filter((d) => d.lastMessageAt || d.unreadCount > 0);

    return {
      channels: [
        {
          channelKey: ORG_CHANNEL,
          type: 'ORG' as const,
          title: 'Team Chat',
          peerUserId: null,
          peerAvatarUrl: null,
          unreadCount: groupUnread,
          lastMessageAt: groupLast?.createdAt ?? null,
          lastPreview: groupLast ? this.preview(groupLast) : null,
        },
        ...activeDms.sort((a, b) => {
          const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
          const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
          return bt - at;
        }),
      ],
      teammates: members.map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        avatarUrl: m.user.avatarUrl,
        channelKey: this.dmChannelKey(userId, m.user.id),
      })),
      totalUnread: groupUnread + activeDms.reduce((sum, d) => sum + d.unreadCount, 0),
    };
  }

  async listMessages(userId: string, channelKey = ORG_CHANNEL) {
    const membership = await this.getMembershipForUser(userId);
    const orgId = membership.orgId;
    await this.assertChannelAccess(userId, orgId, channelKey);

    // The group channel's history can be capped to "since I joined" per-org
    // — a DM only ever has messages from after it started anyway, so this
    // never applies there.
    let historyCutoff: Date | undefined;
    if (channelKey === ORG_CHANNEL) {
      const org = await this.prisma.org.findUnique({
        where: { id: orgId },
        select: { historyVisibleToNewMembers: true },
      });
      if (org && !org.historyVisibleToNewMembers) {
        historyCutoff = membership.createdAt;
      }
    }

    const messages = await this.prisma.chatMessage.findMany({
      where: {
        orgId,
        channelKey,
        ...(historyCutoff ? { createdAt: { gte: historyCutoff } } : {}),
      },
      include: { sender: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
    });

    // Role/ownership shown in chat always reflects the sender's *current*
    // standing in the org, not whatever it was when the message was sent —
    // one batched lookup for every distinct sender in this page, rather than
    // storing role on the message (which would go stale on a promotion).
    const senderIds = [...new Set(messages.map((m) => m.senderId))];
    const roleByUserId = await this.loadRoles(orgId, senderIds);

    return messages
      .reverse()
      .map((m) =>
        this.toResponse(m, m.sender.name, roleByUserId.get(m.senderId)),
      );
  }

  async createMessage(
    userId: string,
    senderName: string,
    input: {
      text?: string;
      channelKey?: string;
      mediaUrl?: string;
      mediaType?: 'IMAGE' | 'VIDEO';
    },
  ) {
    const orgId = await this.getOrgIdForUser(userId);
    const channelKey = input.channelKey?.trim() || ORG_CHANNEL;
    await this.assertChannelAccess(userId, orgId, channelKey);

    const text = input.text?.trim() || null;
    if (!text && !input.mediaUrl) {
      throw new BadRequestException('Message text or media is required');
    }

    const message = await this.prisma.chatMessage.create({
      data: {
        orgId,
        channelKey,
        senderId: userId,
        text,
        mediaUrl: input.mediaUrl ?? null,
        mediaType: input.mediaType ?? null,
      },
    });

    // Sender has obviously read up through this message.
    await this.markRead(userId, channelKey);

    // Push count-only notifications to offline teammates (no message body).
    void this.notifyUnreadCounts(orgId, channelKey, userId).catch((err) =>
      this.logger.warn(`Chat push failed: ${(err as Error).message}`),
    );

    const senderMembership = await this.prisma.membership.findFirst({
      where: { userId, orgId },
    });

    return {
      orgId,
      channelKey,
      message: this.toResponse(message, senderName, senderMembership ?? undefined),
    };
  }

  async markRead(userId: string, channelKey = ORG_CHANNEL) {
    const orgId = await this.getOrgIdForUser(userId);
    await this.assertChannelAccess(userId, orgId, channelKey);
    const now = new Date();
    await this.prisma.chatReadState.upsert({
      where: {
        userId_orgId_channelKey: { userId, orgId, channelKey },
      },
      create: { userId, orgId, channelKey, lastReadAt: now },
      update: { lastReadAt: now },
    });
    return { channelKey, lastReadAt: now, unreadCount: 0 };
  }

  // Who else has read up to this channel's latest point — the backing data
  // for a WhatsApp-style "Seen by" list. Excludes the requester themselves.
  async getReadReceipts(userId: string, channelKey = ORG_CHANNEL) {
    const orgId = await this.getOrgIdForUser(userId);
    await this.assertChannelAccess(userId, orgId, channelKey);

    const states = await this.prisma.chatReadState.findMany({
      where: { orgId, channelKey, userId: { not: userId } },
      include: { user: { select: { name: true } } },
    });

    return states.map((s) => ({
      userId: s.userId,
      name: s.user.name,
      lastReadAt: s.lastReadAt,
    }));
  }

  // Mirrors markRead exactly, but for the "delivered" (double grey tick) tier —
  // marked the moment a client's socket actually receives a channel's messages,
  // not when the user has necessarily looked at them (see markRead for "read").
  async markDelivered(userId: string, channelKey = ORG_CHANNEL) {
    const orgId = await this.getOrgIdForUser(userId);
    await this.assertChannelAccess(userId, orgId, channelKey);
    const now = new Date();
    await this.prisma.chatDeliveryState.upsert({
      where: {
        userId_orgId_channelKey: { userId, orgId, channelKey },
      },
      create: { userId, orgId, channelKey, lastDeliveredAt: now },
      update: { lastDeliveredAt: now },
    });
    return { channelKey, lastDeliveredAt: now };
  }

  // Mirrors getReadReceipts exactly, for the "delivered to" list.
  async getDeliveryReceipts(userId: string, channelKey = ORG_CHANNEL) {
    const orgId = await this.getOrgIdForUser(userId);
    await this.assertChannelAccess(userId, orgId, channelKey);

    const states = await this.prisma.chatDeliveryState.findMany({
      where: { orgId, channelKey, userId: { not: userId } },
      include: { user: { select: { name: true } } },
    });

    return states.map((s) => ({
      userId: s.userId,
      name: s.user.name,
      lastDeliveredAt: s.lastDeliveredAt,
    }));
  }

  async getUnreadSummary(userId: string) {
    const summary = await this.listChannels(userId);
    return { totalUnread: summary.totalUnread, channels: summary.channels };
  }

  private async countUnread(userId: string, orgId: string, channelKey: string) {
    const read = await this.prisma.chatReadState.findUnique({
      where: {
        userId_orgId_channelKey: { userId, orgId, channelKey },
      },
    });
    const since = read?.lastReadAt ?? new Date(0);
    return this.prisma.chatMessage.count({
      where: {
        orgId,
        channelKey,
        createdAt: { gt: since },
        senderId: { not: userId },
      },
    });
  }

  private async lastMessage(orgId: string, channelKey: string) {
    return this.prisma.chatMessage.findFirst({
      where: { orgId, channelKey },
      orderBy: { createdAt: 'desc' },
    });
  }

  private preview(message: {
    text: string | null;
    mediaType: string | null;
  }) {
    if (message.text) return message.text.slice(0, 80);
    if (message.mediaType === 'IMAGE') return '📷 Photo';
    if (message.mediaType === 'VIDEO') return '🎬 Video';
    return '';
  }

  private async notifyUnreadCounts(
    orgId: string,
    channelKey: string,
    senderId: string,
  ) {
    const memberships = await this.prisma.membership.findMany({
      where: { orgId, userId: { not: senderId } },
      include: { user: { select: { id: true, expoPushToken: true } } },
    });

    const recipients =
      channelKey === ORG_CHANNEL
        ? memberships
        : memberships.filter((m) => {
            const peer = this.parseDmPeer(channelKey, senderId);
            return peer === m.userId;
          });

    const messages: PushMessage[] = [];
    for (const m of recipients) {
      const token = m.user.expoPushToken;
      if (!this.pushNotifications.isValidExpoPushToken(token)) continue;
      const unread = await this.countUnread(m.userId, orgId, channelKey);
      if (unread <= 0) continue;
      const isDm = channelKey.startsWith('dm:');
      messages.push({
        to: token,
        title: isDm ? 'Direct Message' : 'Team Chat',
        // Count only — never include message text.
        body:
          unread === 1
            ? '1 unread message'
            : `${unread} unread messages`,
        data: { channelKey, unreadCount: unread, type: 'chat_unread' },
      });
    }
    await this.pushNotifications.send(messages);
  }

  // Batched role/isOwner lookup for a page of messages — keyed by userId so
  // listMessages can resolve every sender's current standing in one query.
  private async loadRoles(orgId: string, userIds: string[]) {
    const memberships = await this.prisma.membership.findMany({
      where: { orgId, userId: { in: userIds } },
    });
    return new Map(memberships.map((m) => [m.userId, m]));
  }

  private toResponse(
    message: {
      id: string;
      senderId: string;
      channelKey?: string;
      text: string | null;
      mediaUrl: string | null;
      mediaType: string | null;
      createdAt: Date;
    },
    senderName: string,
    senderMembership?: { role: MembershipRole; isOwner: boolean },
  ) {
    return {
      id: message.id,
      channelKey: message.channelKey ?? ORG_CHANNEL,
      senderId: message.senderId,
      senderName,
      // null when the sender has since left the org (no current membership
      // to read a role from) — the name still shows, just no role badge.
      senderRole: senderMembership?.role ?? null,
      senderIsOwner: senderMembership?.isOwner ?? false,
      text: message.text,
      mediaUrl: message.mediaUrl,
      mediaType: message.mediaType,
      createdAt: message.createdAt,
    };
  }
}
