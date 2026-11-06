import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationService, PushMessage } from '../common/push-notification.service';

// Matches the local (non-Cloudinary) chat-file URL chat.controller.ts mints
// at upload time — see rescopeMediaUrlForViewer below.
const LOCAL_CHAT_FILE_URL_RE = /^\/chat\/files\/([^?]+)\?token=/;

const HISTORY_LIMIT = 50;
export const ORG_CHANNEL = 'org';
export const GUILD_CHANNEL = 'guild';

/** Tokens after `@` until whitespace — Free Fire IGNs like SES-SRI. */
const MENTION_TOKEN_RE = /@([^\s@]+)/g;

function normalizeIgnKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s~_\-.]+/g, '');
}

function extractMentionTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text.matchAll(MENTION_TOKEN_RE)) {
    if (match[1]) tokens.push(match[1]);
  }
  return [...new Set(tokens)];
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushNotifications: PushNotificationService,
    private readonly jwtService: JwtService,
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

  /** Roster org, or the guild org when the user has no roster seat. */
  async getChatContext(userId: string) {
    const [roster, guild] = await Promise.all([
      this.prisma.membership.findFirst({ where: { userId } }),
      this.prisma.guildMembership.findFirst({ where: { userId } }),
    ]);
    const orgId = roster?.orgId ?? guild?.orgId;
    if (!orgId) {
      throw new NotFoundException('You are not part of an org yet');
    }
    return { orgId, roster: !!roster };
  }

  private async resolveChannel(userId: string, channelKey: string) {
    if (channelKey === GUILD_CHANNEL) {
      const guild = await this.prisma.guildMembership.findFirst({
        where: { userId },
      });
      const roster = guild
        ? null
        : await this.prisma.membership.findFirst({ where: { userId } });
      const orgId = guild?.orgId ?? roster?.orgId;
      if (!orgId) {
        throw new NotFoundException('You are not part of a guild yet');
      }
      await this.assertChannelAccess(userId, orgId, channelKey);
      return { orgId, joinedAt: guild?.createdAt ?? roster!.createdAt };
    }

    const membership = await this.getMembershipForUser(userId);
    await this.assertChannelAccess(userId, membership.orgId, channelKey);
    return { orgId: membership.orgId, joinedAt: membership.createdAt };
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
    if (channelKey === GUILD_CHANNEL) {
      const [guild, roster] = await Promise.all([
        this.prisma.guildMembership.findFirst({ where: { userId, orgId } }),
        this.prisma.membership.findFirst({ where: { userId, orgId } }),
      ]);
      if (!guild && !roster) {
        throw new ForbiddenException('You are not in this guild');
      }
      return;
    }

    const roster = await this.prisma.membership.findFirst({
      where: { userId, orgId },
    });
    if (!roster) {
      throw new ForbiddenException('Roster chat is only for the esports roster');
    }
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
    // Guild-only members (joined via guild code, no roster seat) still need
    // mentionables + unread for GuildHome — do not require Membership here.
    const { orgId, roster } = await this.getChatContext(userId);
    const members = roster
      ? await this.prisma.membership.findMany({
          where: { orgId, userId: { not: userId } },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
                inGameName: true,
              },
            },
          },
          orderBy: { user: { name: 'asc' } },
        })
      : [];
    const memberCount = members.length + (roster ? 1 : 0);

    const groupUnread = roster
      ? await this.countUnread(userId, orgId, ORG_CHANNEL)
      : 0;
    const groupLast = roster
      ? await this.lastMessage(orgId, ORG_CHANNEL)
      : null;

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
          memberCount: null as number | null,
          unreadCount,
          lastMessageAt: last?.createdAt ?? null,
          lastPreview: last ? this.preview(last) : null,
        };
      }),
    );

    // Only surface DMs that already have messages, plus always show group.
    const activeDms = dms.filter((d) => d.lastMessageAt || d.unreadCount > 0);

    // Guild seats for guild-chat @IGN only — never mixed into roster chat.
    const guildSeats = await this.prisma.guildMembership.findMany({
      where: { orgId, userId: { not: userId } },
      include: {
        user: {
          select: { id: true, name: true, avatarUrl: true, inGameName: true },
        },
      },
    });

    const toMentionable = (u: {
      id: string;
      name: string;
      avatarUrl: string | null;
      inGameName: string | null;
    }) => ({
      userId: u.id,
      name: u.name,
      avatarUrl: u.avatarUrl,
      inGameName: u.inGameName,
      channelKey: this.dmChannelKey(userId, u.id),
    });

    const rosterMentionables = members.map((m) => toMentionable(m.user));
    const guildMentionables = guildSeats.map((g) => toMentionable(g.user));

    const guildUnread = await this.countUnread(userId, orgId, GUILD_CHANNEL);
    const guildLast = await this.lastMessage(orgId, GUILD_CHANNEL);
    const guildSeatCount = await this.prisma.guildMembership.count({
      where: { orgId },
    });

    const channels = [
      ...(roster
        ? [
            {
              channelKey: ORG_CHANNEL,
              type: 'ORG' as const,
              title: 'Team Chat',
              peerUserId: null as string | null,
              peerAvatarUrl: null as string | null,
              memberCount,
              unreadCount: groupUnread,
              lastMessageAt: groupLast?.createdAt ?? null,
              lastPreview: groupLast ? this.preview(groupLast) : null,
            },
          ]
        : []),
      {
        channelKey: GUILD_CHANNEL,
        type: 'ORG' as const,
        title: 'Guild Chat',
        peerUserId: null as string | null,
        peerAvatarUrl: null as string | null,
        memberCount: guildSeatCount,
        unreadCount: guildUnread,
        lastMessageAt: guildLast?.createdAt ?? null,
        lastPreview: guildLast ? this.preview(guildLast) : null,
      },
      ...activeDms.sort((a, b) => {
        const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bt - at;
      }),
    ];

    return {
      channels,
      teammates: rosterMentionables,
      // Legacy alias = roster only (org / esports chat). Prefer the scoped
      // lists on clients that know the active channelKey.
      mentionables: rosterMentionables,
      rosterMentionables,
      guildMentionables,
      totalUnread:
        groupUnread +
        guildUnread +
        activeDms.reduce((sum, d) => sum + d.unreadCount, 0),
    };
  }

  // `before` is a message id cursor — pass the oldest message id currently
  // loaded on the client to fetch the next (older) page. Omit it for the
  // initial/most-recent page.
  async listMessages(userId: string, channelKey = ORG_CHANNEL, before?: string) {
    const place = await this.resolveChannel(userId, channelKey);
    const orgId = place.orgId;

    // Group channels can be capped to "since I joined". A DM only ever has
    // messages from after it started, so this never applies there.
    let historyCutoff: Date | undefined;
    if (channelKey === ORG_CHANNEL || channelKey === GUILD_CHANNEL) {
      const org = await this.prisma.org.findUnique({
        where: { id: orgId },
        select: { historyVisibleToNewMembers: true },
      });
      if (org && !org.historyVisibleToNewMembers) {
        historyCutoff = place.joinedAt;
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
      ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    });

    // Role/ownership shown in chat always reflects the sender's *current*
    // standing in the org, not whatever it was when the message was sent —
    // one batched lookup for every distinct sender in this page, rather than
    // storing role on the message (which would go stale on a promotion).
    const senderIds = [...new Set(messages.map((m) => m.senderId))];
    const roleByUserId = await this.loadRoles(orgId, senderIds);

    return this.rescopeForViewer(
      messages
        .reverse()
        .map((m) =>
          this.toResponse(m, m.sender.name, roleByUserId.get(m.senderId)),
        ),
      userId,
    );
  }

  // WhatsApp-style "chat media" gallery — every image/video shared in this
  // one channel, newest first. Same `before` id-cursor convention as
  // listMessages; a page shorter than HISTORY_LIMIT means there's no more.
  async listMedia(userId: string, channelKey = ORG_CHANNEL, before?: string) {
    const { orgId } = await this.resolveChannel(userId, channelKey);

    const messages = await this.prisma.chatMessage.findMany({
      where: { orgId, channelKey, mediaUrl: { not: null } },
      include: { sender: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    });

    const senderIds = [...new Set(messages.map((m) => m.senderId))];
    const roleByUserId = await this.loadRoles(orgId, senderIds);
    return this.rescopeForViewer(
      messages.map((m) =>
        this.toResponse(m, m.sender.name, roleByUserId.get(m.senderId)),
      ),
      userId,
    );
  }

  /**
   * Case-insensitive substring search over message text in one channel.
   * Empty / whitespace-only `q` returns []. Respects the same org-history
   * cutoff as listMessages for the group channel.
   */
  async searchMessages(
    userId: string,
    channelKey = ORG_CHANNEL,
    q = '',
    before?: string,
  ) {
    const query = q.trim().slice(0, 100);
    if (!query) return [];

    const place = await this.resolveChannel(userId, channelKey);
    const orgId = place.orgId;

    let historyCutoff: Date | undefined;
    if (channelKey === ORG_CHANNEL || channelKey === GUILD_CHANNEL) {
      const org = await this.prisma.org.findUnique({
        where: { id: orgId },
        select: { historyVisibleToNewMembers: true },
      });
      if (org && !org.historyVisibleToNewMembers) {
        historyCutoff = place.joinedAt;
      }
    }

    const messages = await this.prisma.chatMessage.findMany({
      where: {
        orgId,
        channelKey,
        text: { contains: query, mode: 'insensitive' },
        ...(historyCutoff ? { createdAt: { gte: historyCutoff } } : {}),
      },
      include: { sender: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    });

    const senderIds = [...new Set(messages.map((m) => m.senderId))];
    const roleByUserId = await this.loadRoles(orgId, senderIds);
    return this.rescopeForViewer(
      messages.map((m) =>
        this.toResponse(m, m.sender.name, roleByUserId.get(m.senderId)),
      ),
      userId,
    );
  }

  // Every message in this channel whose text contains a link, newest first —
  // the backing data for the gallery's "Links" tab. `contains: 'http'` is a
  // simple, cheap filter (not a true URL validator); the client extracts and
  // renders the actual link(s) from each message's text.
  async listLinks(userId: string, channelKey = ORG_CHANNEL, before?: string) {
    const { orgId } = await this.resolveChannel(userId, channelKey);

    const messages = await this.prisma.chatMessage.findMany({
      where: {
        orgId,
        channelKey,
        text: { contains: 'http', mode: 'insensitive' },
      },
      include: { sender: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    });

    const senderIds = [...new Set(messages.map((m) => m.senderId))];
    const roleByUserId = await this.loadRoles(orgId, senderIds);
    return this.rescopeForViewer(
      messages.map((m) =>
        this.toResponse(m, m.sender.name, roleByUserId.get(m.senderId)),
      ),
      userId,
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
    const channelKey = input.channelKey?.trim() || ORG_CHANNEL;
    const { orgId } = await this.resolveChannel(userId, channelKey);

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

    if (input.mediaUrl) {
      this.logger.log(
        `[chat-media] message posted org=${orgId} channel=${channelKey} sender=${userId} mediaType=${input.mediaType ?? 'n/a'} messageId=${message.id}`,
      );
    }

    // Sender has obviously read up through this message.
    await this.markRead(userId, channelKey);

    const mentionedIds = text
      ? await this.resolveMentionedUserIds(orgId, channelKey, text, userId)
      : [];

    // @IGN mentions get a dedicated push; everyone else gets count-only unread.
    if (mentionedIds.length > 0) {
      void this.notifyMentions(
        orgId,
        channelKey,
        userId,
        senderName,
        mentionedIds,
        text!,
      ).catch((err) =>
        this.logger.warn(`Chat mention push failed: ${(err as Error).message}`),
      );
    }
    void this.notifyUnreadCounts(orgId, channelKey, userId, mentionedIds).catch(
      (err) => this.logger.warn(`Chat push failed: ${(err as Error).message}`),
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
    const { orgId } = await this.resolveChannel(userId, channelKey);
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
    const { orgId } = await this.resolveChannel(userId, channelKey);

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
    const { orgId } = await this.resolveChannel(userId, channelKey);
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
    const { orgId } = await this.resolveChannel(userId, channelKey);

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

  /** Match `@IGN` tokens in text to channel members (case/punctuation tolerant). */
  private async resolveMentionedUserIds(
    orgId: string,
    channelKey: string,
    text: string,
    senderId: string,
  ): Promise<string[]> {
    const tokens = extractMentionTokens(text);
    if (tokens.length === 0) return [];

    const candidates = await this.loadMentionCandidates(orgId, channelKey, senderId);
    if (candidates.length === 0) return [];

    const byKey = new Map<string, string>();
    for (const c of candidates) {
      if (!c.inGameName) continue;
      byKey.set(normalizeIgnKey(c.inGameName), c.userId);
    }

    const mentioned = new Set<string>();
    for (const token of tokens) {
      const id = byKey.get(normalizeIgnKey(token));
      if (id) mentioned.add(id);
    }
    return [...mentioned];
  }

  private async loadMentionCandidates(
    orgId: string,
    channelKey: string,
    senderId: string,
  ): Promise<Array<{ userId: string; inGameName: string | null }>> {
    if (channelKey === GUILD_CHANNEL) {
      // Guild chat @tags only people with a guild seat in this org.
      const guild = await this.prisma.guildMembership.findMany({
        where: { orgId, userId: { not: senderId } },
        include: { user: { select: { id: true, inGameName: true } } },
      });
      return guild.map((m) => ({
        userId: m.userId,
        inGameName: m.user.inGameName,
      }));
    }

    if (channelKey === ORG_CHANNEL) {
      // Esports / team chat @tags only roster (owner/coach/analyst/player).
      const roster = await this.prisma.membership.findMany({
        where: { orgId, userId: { not: senderId } },
        include: { user: { select: { id: true, inGameName: true } } },
      });
      return roster.map((m) => ({
        userId: m.userId,
        inGameName: m.user.inGameName,
      }));
    }

    // DM — only the peer can be mentioned (still useful for highlight UX).
    const peerId = this.parseDmPeer(channelKey, senderId);
    if (!peerId) return [];
    const peer = await this.prisma.user.findUnique({
      where: { id: peerId },
      select: { id: true, inGameName: true },
    });
    return peer ? [{ userId: peer.id, inGameName: peer.inGameName }] : [];
  }

  private async notifyMentions(
    orgId: string,
    channelKey: string,
    senderId: string,
    senderName: string,
    mentionedUserIds: string[],
    text: string,
  ) {
    const users = await this.prisma.user.findMany({
      where: { id: { in: mentionedUserIds } },
      select: { id: true, expoPushToken: true, inGameName: true },
    });

    const channelLabel =
      channelKey === GUILD_CHANNEL
        ? 'Guild Chat'
        : channelKey.startsWith('dm:')
          ? 'Direct Message'
          : 'Team Chat';

    // Prefer the first matched @token that points at this user for the body.
    const tokens = extractMentionTokens(text);
    const messages: PushMessage[] = [];
    for (const u of users) {
      if (!this.pushNotifications.isValidExpoPushToken(u.expoPushToken)) continue;
      const ign = u.inGameName ?? 'you';
      const matched =
        tokens.find(
          (t) =>
            u.inGameName &&
            normalizeIgnKey(t) === normalizeIgnKey(u.inGameName),
        ) ?? ign;
      messages.push({
        to: u.expoPushToken,
        title: `${senderName} mentioned you`,
        // No full message body — just who was tagged and where.
        body: `@${matched} in ${channelLabel}`,
        data: {
          channelKey,
          type: 'chat_mention',
          mentionedBy: senderId,
        },
      });
    }
    await this.pushNotifications.send(messages);
  }

  private async notifyUnreadCounts(
    orgId: string,
    channelKey: string,
    senderId: string,
    skipUserIds: string[] = [],
  ) {
    const skip = new Set(skipUserIds);
    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
      select: { name: true },
    });
    const senderLabel = sender?.name?.trim() || 'Someone';

    const rosterMembers = await this.prisma.membership.findMany({
      where: { orgId, userId: { not: senderId } },
      include: { user: { select: { id: true, expoPushToken: true } } },
    });

    const rosterRecipients = rosterMembers.map((member) => ({
      userId: member.userId,
      expoPushToken: member.user.expoPushToken,
    }));
    let recipients = rosterRecipients;
    if (channelKey === GUILD_CHANNEL) {
      const guildMembers = await this.prisma.guildMembership.findMany({
        where: { orgId, userId: { not: senderId } },
        include: { user: { select: { expoPushToken: true } } },
      });
      const byId = new Map<string, { userId: string; expoPushToken: string | null }>();
      for (const member of guildMembers) {
        byId.set(member.userId, {
          userId: member.userId,
          expoPushToken: member.user.expoPushToken,
        });
      }
      for (const member of rosterRecipients) byId.set(member.userId, member);
      recipients = [...byId.values()];
    } else if (channelKey.startsWith('dm:')) {
      const peerId = this.parseDmPeer(channelKey, senderId);
      if (peerId) {
        const peer = await this.prisma.user.findUnique({
          where: { id: peerId },
          select: { id: true, expoPushToken: true },
        });
        recipients = peer
          ? [{ userId: peer.id, expoPushToken: peer.expoPushToken }]
          : [];
      } else {
        recipients = [];
      }
    }

    const messages: PushMessage[] = [];
    for (const m of recipients) {
      if (skip.has(m.userId)) continue;
      const token = m.expoPushToken;
      if (!this.pushNotifications.isValidExpoPushToken(token)) continue;
      const unread = await this.countUnread(m.userId, orgId, channelKey);
      if (unread <= 0) continue;
      const isDm = channelKey.startsWith('dm:');
      messages.push({
        to: token,
        title:
          channelKey === GUILD_CHANNEL
            ? 'Guild Chat'
            : isDm
              ? 'Direct Message'
              : 'Team Chat',
        // Sender name + unread count — never include message text.
        body:
          unread === 1
            ? `${senderLabel}: 1 unread message`
            : `${senderLabel}: ${unread} unread messages`,
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

  // The token embedded in a message's mediaUrl is minted once, at upload
  // time, scoped to whoever uploaded it (chat.controller.ts uploadChatMedia)
  // — every viewer who ever loads this message's history would otherwise
  // reuse that SAME token, so downloadChatFile ends up re-checking the
  // uploader's current org membership forever, never the actual current
  // viewer's. Re-minting it here, scoped to the viewer asking for this page
  // of history right now, means a departed member's cached/shared link
  // starts failing the next time downloadChatFile checks *their* membership
  // — not the original uploader's, who might still be in the org.
  // Cloudinary URLs (no embedded token, access is "unguessable public id")
  // pass through unchanged, same as media.service.ts's equivalent case.
  private async rescopeMediaUrlForViewer(
    mediaUrl: string | null,
    viewerId: string,
  ): Promise<string | null> {
    if (!mediaUrl) return null;
    const match = mediaUrl.match(LOCAL_CHAT_FILE_URL_RE);
    if (!match) return mediaUrl;
    const fileKey = decodeURIComponent(match[1]);
    const token = await this.jwtService.signAsync(
      { sub: viewerId, fileKey, purpose: 'chat-file' },
      { expiresIn: '7d' },
    );
    return `/chat/files/${encodeURIComponent(fileKey)}?token=${token}`;
  }

  private async rescopeForViewer<T extends { mediaUrl: string | null }>(
    rows: T[],
    viewerId: string,
  ): Promise<T[]> {
    return Promise.all(
      rows.map(async (row) => ({
        ...row,
        mediaUrl: await this.rescopeMediaUrlForViewer(row.mediaUrl, viewerId),
      })),
    );
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
