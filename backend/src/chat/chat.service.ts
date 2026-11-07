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
import { MediaStorageService } from '../media/media-storage.service';
import { ChatPresenceTracker } from './chat-presence.tracker';

// Matches the chat-file proxy URL chat.controller.ts mints at upload time
// (local disk or Cloudinary fileKey) — see rescopeMediaUrlForViewer below.
const LOCAL_CHAT_FILE_URL_RE = /^\/chat\/files\/([^?]+)\?token=/;
// Legacy messages that baked a Cloudinary delivery URL into mediaUrl.
const CLOUDINARY_DELIVERY_RE =
  /res\.cloudinary\.com\/[^/]+\/(image|video)\/authenticated\/(?:s--[^/]+--\/)?(?:v\d+\/)?([^?]+)/;

const HISTORY_LIMIT = 50;
const MAX_PINS_PER_CHANNEL = 3;
/** Allowed disappearing-message timers (seconds). 0 = off. */
export const DISAPPEAR_OPTIONS_SEC = [0, 3600, 86400, 604800] as const;
export const ORG_CHANNEL = 'org';
export const GUILD_CHANNEL = 'guild';

/** Tokens after `@` until whitespace — Free Fire IGNs like SES-SRI. */
const MENTION_TOKEN_RE = /@([^\s@]+)/g;

function normalizeIgnKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s~_\-.]+/g, '');
}

function truncatePushBody(
  text: string | null | undefined,
  max: number,
): string | null {
  const t = text?.trim();
  if (!t) return null;
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
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
    private readonly storage: MediaStorageService,
    private readonly presence: ChatPresenceTracker,
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

  async resolveChannel(userId: string, channelKey: string) {
    if (channelKey === ORG_CHANNEL) {
      const membership = await this.getMembershipForUser(userId);
      await this.assertChannelAccess(userId, membership.orgId, channelKey);
      return { orgId: membership.orgId, joinedAt: membership.createdAt };
    }

    // Guild chat and DMs are open to roster players and guild-only members
    // alike — resolve orgId from whichever membership the caller actually
    // has, same as getChatContext.
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

    if (channelKey === ORG_CHANNEL) {
      const roster = await this.prisma.membership.findFirst({
        where: { userId, orgId },
      });
      if (!roster) {
        throw new ForbiddenException('Roster chat is only for the esports roster');
      }
      return;
    }

    // DM — 1:1 chat is for the whole guild, not just the roster. Either a
    // roster seat or a plain guild seat in this org qualifies both sides.
    const [guild, roster] = await Promise.all([
      this.prisma.guildMembership.findFirst({ where: { userId, orgId } }),
      this.prisma.membership.findFirst({ where: { userId, orgId } }),
    ]);
    if (!guild && !roster) {
      throw new ForbiddenException('You are not in this guild');
    }
    const peerId = this.parseDmPeer(channelKey, userId);
    if (!peerId) {
      throw new BadRequestException('Invalid channel');
    }
    if (this.dmChannelKey(userId, peerId) !== channelKey) {
      throw new ForbiddenException('Not a member of this DM');
    }
    const [peerGuild, peerRoster] = await Promise.all([
      this.prisma.guildMembership.findFirst({ where: { userId: peerId, orgId } }),
      this.prisma.membership.findFirst({ where: { userId: peerId, orgId } }),
    ]);
    if (!peerGuild && !peerRoster) {
      throw new NotFoundException('That person is not in your guild');
    }
  }

  async listChannels(userId: string) {
    // Guild-only members (joined via guild code, no roster seat) still need
    // mentionables + unread for GuildHome — do not require Membership here.
    const { orgId, roster } = await this.getChatContext(userId);

    const [rosterRows, guildSeats] = await Promise.all([
      roster
        ? this.prisma.membership.findMany({
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
        : Promise.resolve([]),
      this.prisma.guildMembership.findMany({
        where: { orgId, userId: { not: userId } },
        include: {
          user: {
            select: { id: true, name: true, avatarUrl: true, inGameName: true },
          },
        },
      }),
    ]);
    const memberCount = rosterRows.length + (roster ? 1 : 0);

    // 1:1 chat is for the whole guild, not just the roster — union both
    // pools (a roster player is almost always also a guild member, so this
    // is usually just guildSeats, but either seat qualifies someone as a DM
    // candidate for everyone else here) de-duplicated by user.
    const peerById = new Map<
      string,
      { id: string; name: string; avatarUrl: string | null; inGameName: string | null }
    >();
    for (const m of rosterRows) peerById.set(m.user.id, m.user);
    for (const g of guildSeats) peerById.set(g.user.id, g.user);
    const peers = [...peerById.values()].sort((a, b) => a.name.localeCompare(b.name));

    const [selfRoster, selfGuild] = await Promise.all([
      roster
        ? this.prisma.membership.findFirst({
            where: { userId, orgId },
            select: { createdAt: true },
          })
        : Promise.resolve(null),
      this.prisma.guildMembership.findFirst({
        where: { userId, orgId },
        select: { createdAt: true },
      }),
    ]);
    const groupCutoff = selfRoster
      ? await this.historyCutoffFor(orgId, ORG_CHANNEL, selfRoster.createdAt)
      : undefined;
    const mutedRows = await this.prisma.chatMute.findMany({
      where: { userId, orgId },
      select: { channelKey: true },
    });
    const mutedKeys = new Set(mutedRows.map((r) => r.channelKey));
    const channelMetas = await this.prisma.chatChannelMeta.findMany({
      where: {
        orgId,
        channelKey: { in: [ORG_CHANNEL, GUILD_CHANNEL] },
      },
      select: { channelKey: true, avatarUrl: true },
    });
    const avatarByChannel = new Map(
      channelMetas.map((m) => [m.channelKey, m.avatarUrl] as const),
    );

    const groupUnread = roster
      ? await this.countUnread(userId, orgId, ORG_CHANNEL, groupCutoff)
      : 0;
    const groupLast = roster
      ? await this.lastMessage(orgId, ORG_CHANNEL, groupCutoff)
      : null;

    const dms = await Promise.all(
      peers.map(async (u) => {
        const channelKey = this.dmChannelKey(userId, u.id);
        const unreadCount = await this.countUnread(userId, orgId, channelKey);
        const last = await this.lastMessage(orgId, channelKey);
        return {
          channelKey,
          type: 'DM' as const,
          title: u.name,
          peerUserId: u.id,
          peerAvatarUrl: u.avatarUrl,
          memberCount: null as number | null,
          unreadCount,
          lastMessageAt: last?.createdAt ?? null,
          lastPreview: last ? this.preview(last) : null,
          muted: mutedKeys.has(channelKey),
        };
      }),
    );

    // Only surface DMs that already have messages, plus always show group.
    const activeDms = dms.filter((d) => d.lastMessageAt || d.unreadCount > 0);

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

    const rosterMentionables = rosterRows.map((m) => toMentionable(m.user));
    const guildMentionables = guildSeats.map((g) => toMentionable(g.user));
    // "Start new chat" / DM candidate pool — every guild member, roster or not.
    const teammates = peers.map(toMentionable);

    const guildJoinedAt =
      selfGuild?.createdAt ?? selfRoster?.createdAt;
    const guildCutoff = guildJoinedAt
      ? await this.historyCutoffFor(orgId, GUILD_CHANNEL, guildJoinedAt)
      : undefined;
    const guildUnread = await this.countUnread(
      userId,
      orgId,
      GUILD_CHANNEL,
      guildCutoff,
    );
    const guildLast = await this.lastMessage(orgId, GUILD_CHANNEL, guildCutoff);
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
              peerAvatarUrl: avatarByChannel.get(ORG_CHANNEL) ?? null,
              memberCount,
              unreadCount: groupUnread,
              lastMessageAt: groupLast?.createdAt ?? null,
              lastPreview: groupLast ? this.preview(groupLast) : null,
              muted: mutedKeys.has(ORG_CHANNEL),
            },
          ]
        : []),
      {
        channelKey: GUILD_CHANNEL,
        type: 'ORG' as const,
        title: 'Guild Chat',
        peerUserId: null as string | null,
        peerAvatarUrl: avatarByChannel.get(GUILD_CHANNEL) ?? null,
        memberCount: guildSeatCount,
        unreadCount: guildUnread,
        lastMessageAt: guildLast?.createdAt ?? null,
        lastPreview: guildLast ? this.preview(guildLast) : null,
        muted: mutedKeys.has(GUILD_CHANNEL),
      },
      ...activeDms.sort((a, b) => {
        const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bt - at;
      }),
    ];

    return {
      channels,
      // DM candidate pool — the whole guild, not just the roster.
      teammates,
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

  /**
   * When the org hides pre-join history, group channels only show messages
   * at/after the viewer's join time. DMs are never cut off.
   * Unread badges / pushes must use the same floor or a late opener gets
   * notified for messages they can never load.
   */
  private async historyCutoffFor(
    orgId: string,
    channelKey: string,
    joinedAt: Date,
  ): Promise<Date | undefined> {
    if (channelKey !== ORG_CHANNEL && channelKey !== GUILD_CHANNEL) {
      return undefined;
    }
    const org = await this.prisma.org.findUnique({
      where: { id: orgId },
      select: { historyVisibleToNewMembers: true },
    });
    if (org && !org.historyVisibleToNewMembers) return joinedAt;
    return undefined;
  }

  // `before` is a message id cursor — pass the oldest message id currently
  // loaded on the client to fetch the next (older) page. Omit it for the
  // initial/most-recent page.
  async listMessages(
    userId: string,
    channelKey = ORG_CHANNEL,
    before?: string,
    opts?: { starredOnly?: boolean },
  ) {
    const place = await this.resolveChannel(userId, channelKey);
    const orgId = place.orgId;
    const historyCutoff = await this.historyCutoffFor(
      orgId,
      channelKey,
      place.joinedAt,
    );
    const clear = await this.prisma.chatClear.findUnique({
      where: {
        userId_orgId_channelKey: { userId, orgId, channelKey },
      },
      select: { clearedAt: true },
    });
    // Soft clear-for-me + join-date history floor — take the later of the two.
    let lowerBound = historyCutoff;
    if (clear?.clearedAt) {
      lowerBound =
        !lowerBound || clear.clearedAt > lowerBound ? clear.clearedAt : lowerBound;
    }

    const starredIds = opts?.starredOnly
      ? (
          await this.prisma.chatStar.findMany({
            where: { userId, orgId, channelKey },
            select: { messageId: true },
          })
        ).map((s) => s.messageId)
      : null;

    const messages = await this.prisma.chatMessage.findMany({
      where: {
        orgId,
        channelKey,
        ...(lowerBound ? { createdAt: { gte: lowerBound } } : {}),
        ...(starredIds
          ? { id: { in: starredIds.length ? starredIds : ['__none__'] } }
          : {}),
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
    const replyMap = await this.loadReplyPreviews(
      messages.map((m) => m.replyToId).filter((id): id is string => !!id),
    );
    const starSet = new Set(
      (
        await this.prisma.chatStar.findMany({
          where: {
            userId,
            messageId: { in: messages.map((m) => m.id) },
          },
          select: { messageId: true },
        })
      ).map((s) => s.messageId),
    );
    const pinSet = new Set(
      (
        await this.prisma.chatPin.findMany({
          where: {
            orgId,
            channelKey,
            messageId: { in: messages.map((m) => m.id) },
          },
          select: { messageId: true },
        })
      ).map((p) => p.messageId),
    );

    return this.rescopeForViewer(
      messages
        .reverse()
        .map((m) => ({
          ...this.toResponse(
            m,
            m.sender.name,
            roleByUserId.get(m.senderId),
            m.replyToId ? replyMap.get(m.replyToId) : undefined,
          ),
          starred: starSet.has(m.id),
          pinned: pinSet.has(m.id),
        })),
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
    const historyCutoff = await this.historyCutoffFor(
      orgId,
      channelKey,
      place.joinedAt,
    );

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
      replyToId?: string;
      /** Skip Expo push (e.g. scrim auto-post that already sent its own push). */
      skipPush?: boolean;
    },
  ) {
    const channelKey = input.channelKey?.trim() || ORG_CHANNEL;
    const { orgId } = await this.resolveChannel(userId, channelKey);

    const text = input.text?.trim() || null;
    if (!text && !input.mediaUrl) {
      throw new BadRequestException('Message text or media is required');
    }

    let replyToId: string | null = null;
    if (input.replyToId?.trim()) {
      const parent = await this.prisma.chatMessage.findFirst({
        where: {
          id: input.replyToId.trim(),
          orgId,
          channelKey,
        },
        select: { id: true },
      });
      if (!parent) {
        throw new BadRequestException('Reply target not found in this chat');
      }
      replyToId = parent.id;
    }

    const message = await this.prisma.chatMessage.create({
      data: {
        orgId,
        channelKey,
        senderId: userId,
        text,
        mediaUrl: input.mediaUrl ?? null,
        mediaType: input.mediaType ?? null,
        replyToId,
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

    // @IGN mentions get a dedicated push; everyone else gets unread + preview.
    if (!input.skipPush) {
      if (mentionedIds.length > 0) {
        void this.notifyMentions(
          orgId,
          channelKey,
          userId,
          senderName,
          mentionedIds,
          text!,
        ).catch((err) =>
          this.logger.warn(
            `Chat mention push failed: ${(err as Error).message}`,
          ),
        );
      }
      void this.notifyUnreadCounts(
        orgId,
        channelKey,
        userId,
        mentionedIds,
        text,
        input.mediaType,
      ).catch((err) =>
        this.logger.warn(`Chat push failed: ${(err as Error).message}`),
      );
    }

    const senderMembership = await this.prisma.membership.findFirst({
      where: { userId, orgId },
    });

    // Socket broadcast is one payload for every viewer — mint a fresh CDN
    // URL (or viewer-scoped proxy) so the image paints immediately instead
    // of shipping the raw upload-time proxy token.
    const replyPreview = replyToId
      ? await this.loadReplyPreviews([replyToId]).then((m) => m.get(replyToId!))
      : undefined;
    const response = this.toResponse(
      message,
      senderName,
      senderMembership ?? undefined,
      replyPreview,
    );
    response.mediaUrl = await this.rescopeMediaUrlForViewer(
      response.mediaUrl,
      userId,
    );

    return {
      orgId,
      channelKey,
      message: response,
    };
  }

  /**
   * Edit own text message only while nobody else has read it yet
   * (WhatsApp-style "edit before seen").
   */
  async editOwnMessage(userId: string, messageId: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new BadRequestException('Message text is required');
    }
    const { orgId } = await this.getChatContext(userId);
    const message = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, senderId: userId, orgId },
      include: { sender: { select: { name: true } } },
    });
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    if (!message.text && !trimmed) {
      throw new BadRequestException('Only text messages can be edited');
    }

    const readers = await this.prisma.chatReadState.count({
      where: {
        orgId,
        channelKey: message.channelKey,
        userId: { not: userId },
        lastReadAt: { gte: message.createdAt },
      },
    });
    if (readers > 0) {
      throw new ForbiddenException(
        'This message was already read — edit is no longer allowed',
      );
    }

    const updated = await this.prisma.chatMessage.update({
      where: { id: message.id },
      data: { text: trimmed, editedAt: new Date() },
      include: { sender: { select: { name: true } } },
    });

    const senderMembership = await this.prisma.membership.findFirst({
      where: { userId, orgId },
    });
    const replyPreview = updated.replyToId
      ? await this.loadReplyPreviews([updated.replyToId]).then((m) =>
          m.get(updated.replyToId!),
        )
      : undefined;
    const response = this.toResponse(
      updated,
      updated.sender.name,
      senderMembership ?? undefined,
      replyPreview,
    );
    response.mediaUrl = await this.rescopeMediaUrlForViewer(
      response.mediaUrl,
      userId,
    );

    return {
      orgId,
      channelKey: updated.channelKey,
      message: response,
    };
  }

  async setChannelMuted(userId: string, channelKey: string, muted: boolean) {
    const key = channelKey.trim() || ORG_CHANNEL;
    const { orgId } = await this.resolveChannel(userId, key);
    if (muted) {
      await this.prisma.chatMute.upsert({
        where: {
          userId_orgId_channelKey: { userId, orgId, channelKey: key },
        },
        create: { userId, orgId, channelKey: key },
        update: {},
      });
    } else {
      await this.prisma.chatMute.deleteMany({
        where: { userId, orgId, channelKey: key },
      });
    }
    return { channelKey: key, muted };
  }

  async isChannelMuted(userId: string, orgId: string, channelKey: string) {
    const row = await this.prisma.chatMute.findUnique({
      where: {
        userId_orgId_channelKey: { userId, orgId, channelKey },
      },
      select: { id: true },
    });
    return !!row;
  }

  async clearChatForMe(userId: string, channelKey: string) {
    const key = channelKey.trim() || ORG_CHANNEL;
    const { orgId } = await this.resolveChannel(userId, key);
    const clearedAt = new Date();
    await this.prisma.chatClear.upsert({
      where: {
        userId_orgId_channelKey: { userId, orgId, channelKey: key },
      },
      create: { userId, orgId, channelKey: key, clearedAt },
      update: { clearedAt },
    });
    // Unpin/unstar for this user is optional — cleared messages just hide.
    return { channelKey: key, clearedAt };
  }

  async setMessagePinned(
    userId: string,
    channelKey: string,
    messageId: string,
    pinned: boolean,
  ) {
    const key = channelKey.trim() || ORG_CHANNEL;
    const { orgId } = await this.resolveChannel(userId, key);
    const message = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, orgId, channelKey: key },
      select: { id: true },
    });
    if (!message) throw new NotFoundException('Message not found');

    if (!pinned) {
      await this.prisma.chatPin.deleteMany({
        where: { orgId, channelKey: key, messageId },
      });
      return { channelKey: key, messageId, pinned: false };
    }

    const existing = await this.prisma.chatPin.count({
      where: { orgId, channelKey: key },
    });
    const already = await this.prisma.chatPin.findUnique({
      where: {
        orgId_channelKey_messageId: {
          orgId,
          channelKey: key,
          messageId,
        },
      },
    });
    if (!already && existing >= MAX_PINS_PER_CHANNEL) {
      throw new BadRequestException(
        `You can pin up to ${MAX_PINS_PER_CHANNEL} messages`,
      );
    }
    await this.prisma.chatPin.upsert({
      where: {
        orgId_channelKey_messageId: {
          orgId,
          channelKey: key,
          messageId,
        },
      },
      create: {
        orgId,
        channelKey: key,
        messageId,
        pinnedById: userId,
      },
      update: { pinnedById: userId, pinnedAt: new Date() },
    });
    return { channelKey: key, messageId, pinned: true };
  }

  async listPinnedMessages(userId: string, channelKey: string) {
    const key = channelKey.trim() || ORG_CHANNEL;
    const { orgId } = await this.resolveChannel(userId, key);
    const pins = await this.prisma.chatPin.findMany({
      where: { orgId, channelKey: key },
      include: {
        message: { include: { sender: { select: { name: true } } } },
      },
      orderBy: { pinnedAt: 'desc' },
    });
    const senderIds = [...new Set(pins.map((p) => p.message.senderId))];
    const roleByUserId = await this.loadRoles(orgId, senderIds);
    return this.rescopeForViewer(
      pins.map((p) => ({
        ...this.toResponse(
          p.message,
          p.message.sender.name,
          roleByUserId.get(p.message.senderId),
        ),
        pinned: true,
        pinnedAt: p.pinnedAt,
      })),
      userId,
    );
  }

  async setMessageStarred(
    userId: string,
    channelKey: string,
    messageId: string,
    starred: boolean,
  ) {
    const key = channelKey.trim() || ORG_CHANNEL;
    const { orgId } = await this.resolveChannel(userId, key);
    const message = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, orgId, channelKey: key },
      select: { id: true },
    });
    if (!message) throw new NotFoundException('Message not found');

    if (!starred) {
      await this.prisma.chatStar.deleteMany({
        where: { userId, messageId },
      });
      return { messageId, starred: false };
    }
    await this.prisma.chatStar.upsert({
      where: { userId_messageId: { userId, messageId } },
      create: { userId, orgId, channelKey: key, messageId },
      update: {},
    });
    return { messageId, starred: true };
  }

  async getChannelMeta(userId: string, channelKey: string) {
    const key = channelKey.trim() || ORG_CHANNEL;
    const { orgId } = await this.resolveChannel(userId, key);
    const meta = await this.prisma.chatChannelMeta.findUnique({
      where: { orgId_channelKey: { orgId, channelKey: key } },
    });
    return {
      channelKey: key,
      description: meta?.description ?? null,
      avatarUrl: meta?.avatarUrl ?? null,
      disappearAfterSec: meta?.disappearAfterSec ?? null,
    };
  }

  async updateChannelMeta(
    userId: string,
    channelKey: string,
    input: {
      description?: string | null;
      disappearAfterSec?: number | null;
    },
  ) {
    const key = channelKey.trim() || ORG_CHANNEL;
    const { orgId } = await this.resolveChannel(userId, key);
    if (key === ORG_CHANNEL || key === GUILD_CHANNEL) {
      await this.assertCanManageGroup(userId, orgId);
    }

    let disappearAfterSec = input.disappearAfterSec;
    if (disappearAfterSec != null) {
      if (
        !(DISAPPEAR_OPTIONS_SEC as readonly number[]).includes(disappearAfterSec)
      ) {
        throw new BadRequestException('Invalid disappearing-message timer');
      }
      if (disappearAfterSec === 0) disappearAfterSec = null;
    }

    const description =
      input.description === undefined
        ? undefined
        : input.description == null
          ? null
          : input.description.trim().slice(0, 500) || null;

    const meta = await this.prisma.chatChannelMeta.upsert({
      where: { orgId_channelKey: { orgId, channelKey: key } },
      create: {
        orgId,
        channelKey: key,
        description: description ?? null,
        disappearAfterSec: disappearAfterSec ?? null,
        updatedById: userId,
      },
      update: {
        ...(description !== undefined ? { description } : {}),
        ...(input.disappearAfterSec !== undefined
          ? { disappearAfterSec }
          : {}),
        updatedById: userId,
      },
    });
    return {
      channelKey: key,
      description: meta.description,
      avatarUrl: meta.avatarUrl,
      disappearAfterSec: meta.disappearAfterSec,
    };
  }

  async setChannelAvatar(
    userId: string,
    channelKey: string,
    stored: { fileKey: string; deliveryUrl: string | null },
  ) {
    const key = channelKey.trim() || ORG_CHANNEL;
    if (key !== ORG_CHANNEL && key !== GUILD_CHANNEL) {
      throw new BadRequestException('Only group chats can have an avatar');
    }
    const { orgId } = await this.resolveChannel(userId, key);
    await this.assertCanManageGroup(userId, orgId);

    const existing = await this.prisma.chatChannelMeta.findUnique({
      where: { orgId_channelKey: { orgId, channelKey: key } },
      select: { avatarFileKey: true },
    });

    const avatarUrl =
      stored.deliveryUrl ?? `/chat/files/${encodeURIComponent(stored.fileKey)}`;

    const meta = await this.prisma.chatChannelMeta.upsert({
      where: { orgId_channelKey: { orgId, channelKey: key } },
      create: {
        orgId,
        channelKey: key,
        avatarUrl,
        avatarFileKey: stored.fileKey,
        updatedById: userId,
      },
      update: {
        avatarUrl,
        avatarFileKey: stored.fileKey,
        updatedById: userId,
      },
    });

    if (existing?.avatarFileKey && existing.avatarFileKey !== stored.fileKey) {
      await this.storage.deleteFile(existing.avatarFileKey);
    }

    return {
      channelKey: key,
      description: meta.description,
      avatarUrl: meta.avatarUrl,
      disappearAfterSec: meta.disappearAfterSec,
    };
  }

  /** Cron helper — hard-delete messages past each channel's disappear timer. */
  async purgeExpiredMessages() {
    const metas = await this.prisma.chatChannelMeta.findMany({
      where: { disappearAfterSec: { not: null } },
      select: { orgId: true, channelKey: true, disappearAfterSec: true },
    });
    let deleted = 0;
    const now = Date.now();
    for (const meta of metas) {
      const sec = meta.disappearAfterSec;
      if (!sec || sec <= 0) continue;
      const cutoff = new Date(now - sec * 1000);
      const result = await this.prisma.chatMessage.deleteMany({
        where: {
          orgId: meta.orgId,
          channelKey: meta.channelKey,
          createdAt: { lt: cutoff },
        },
      });
      deleted += result.count;
    }
    return deleted;
  }

  private async assertCanManageGroup(userId: string, orgId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId, orgId },
    });
    if (membership?.isOwner || membership?.role === 'COACH') return;
    const guild = await this.prisma.guildMembership.findFirst({
      where: {
        userId,
        orgId,
        role: { in: ['LEADER', 'ELDER', 'ACTIVE_LEADER'] },
      },
    });
    if (guild) return;
    throw new ForbiddenException('Only coaches / owners can edit group settings');
  }

  /**
   * WhatsApp-style "delete for everyone" — only the sender can remove their
   * own messages. Returns the rows that were actually deleted so the gateway
   * can broadcast per-channel.
   */
  async deleteOwnMessages(userId: string, ids: string[]) {
    const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    if (uniqueIds.length === 0) {
      throw new BadRequestException('No message ids provided');
    }
    const { orgId } = await this.getChatContext(userId);
    const rows = await this.prisma.chatMessage.findMany({
      where: {
        id: { in: uniqueIds },
        senderId: userId,
        orgId,
      },
      select: { id: true, channelKey: true, orgId: true },
    });
    if (rows.length === 0) {
      return { deleted: [] as Array<{ id: string; channelKey: string; orgId: string }> };
    }
    await this.prisma.chatMessage.deleteMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
    return { deleted: rows };
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

  private async countUnread(
    userId: string,
    orgId: string,
    channelKey: string,
    historyCutoff?: Date,
  ) {
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
        // Same visibility floor as listMessages — never notify for rows the
        // viewer cannot load when history is hidden for new members.
        createdAt: {
          gt: since,
          ...(historyCutoff ? { gte: historyCutoff } : {}),
        },
        senderId: { not: userId },
      },
    });
  }

  private async lastMessage(
    orgId: string,
    channelKey: string,
    historyCutoff?: Date,
  ) {
    return this.prisma.chatMessage.findFirst({
      where: {
        orgId,
        channelKey,
        ...(historyCutoff ? { createdAt: { gte: historyCutoff } } : {}),
      },
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
      if (this.presence.isViewing(u.id, channelKey)) continue;
      if (await this.isChannelMuted(u.id, orgId, channelKey)) continue;
      const ign = u.inGameName ?? 'you';
      const matched =
        tokens.find(
          (t) =>
            u.inGameName &&
            normalizeIgnKey(t) === normalizeIgnKey(u.inGameName),
        ) ?? ign;
      const preview = truncatePushBody(text, 80);
      messages.push({
        to: u.expoPushToken,
        title: `${senderName} mentioned you`,
        body: preview
          ? `@${matched}: ${preview}`
          : `@${matched} in ${channelLabel}`,
        data: {
          channelKey,
          type: 'chat_mention',
          mentionedBy: senderId,
        },
        collapseId: `chat-mention:${orgId}:${channelKey}:${u.id}`,
        channelId: 'chat',
      });
    }
    await this.pushNotifications.send(messages);
  }

  private async notifyUnreadCounts(
    orgId: string,
    channelKey: string,
    senderId: string,
    skipUserIds: string[] = [],
    latestText: string | null = null,
    mediaType?: 'IMAGE' | 'VIDEO' | null,
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
      // They're looking at this thread right now — live socket already
      // delivers the bubble; a push would just spam the shade.
      if (this.presence.isViewing(m.userId, channelKey)) continue;
      if (await this.isChannelMuted(m.userId, orgId, channelKey)) continue;
      const token = m.expoPushToken;
      if (!this.pushNotifications.isValidExpoPushToken(token)) continue;
      let cutoff: Date | undefined;
      if (channelKey === ORG_CHANNEL || channelKey === GUILD_CHANNEL) {
        const seat =
          channelKey === ORG_CHANNEL
            ? await this.prisma.membership.findFirst({
                where: { userId: m.userId, orgId },
                select: { createdAt: true },
              })
            : (await this.prisma.guildMembership.findFirst({
                where: { userId: m.userId, orgId },
                select: { createdAt: true },
              })) ??
              (await this.prisma.membership.findFirst({
                where: { userId: m.userId, orgId },
                select: { createdAt: true },
              }));
        if (seat) {
          cutoff = await this.historyCutoffFor(orgId, channelKey, seat.createdAt);
        }
      }
      const unread = await this.countUnread(m.userId, orgId, channelKey, cutoff);
      if (unread <= 0) continue;
      const isDm = channelKey.startsWith('dm:');
      const title =
        channelKey === GUILD_CHANNEL
          ? 'Guild Chat'
          : isDm
            ? 'Direct Message'
            : 'Team Chat';
      // Show preview when free (single unread); otherwise count so tray stays tidy.
      // collapseId replaces the previous tray entry for this channel.
      const preview =
        unread === 1
          ? truncatePushBody(latestText, 100) ||
            (mediaType === 'VIDEO'
              ? 'Sent a video'
              : mediaType === 'IMAGE'
                ? 'Sent a photo'
                : null)
          : null;
      messages.push({
        to: token,
        title,
        body: preview
          ? `${senderLabel}: ${preview}`
          : unread === 1
            ? `${senderLabel}: 1 unread message`
            : `${senderLabel}: ${unread} unread messages`,
        data: { channelKey, unreadCount: unread, type: 'chat_unread' },
        collapseId: `chat:${orgId}:${channelKey}`,
        channelId: 'chat',
        badge: unread,
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

  // Chat messages store a stable `/chat/files/{fileKey}?token=…` proxy
  // (or, for older rows, a Cloudinary delivery URL). On every history/media
  // list we turn that into something the viewer can load right now:
  //   • Cloudinary fileKey → freshly signed CDN URL (same as Media feed)
  //   • Local fileKey → reminted proxy token scoped to this viewer
  //   • Legacy Cloudinary delivery URL → regenerate from the public_id
  // Reminting the proxy token matters because the upload-time token is
  // scoped to the uploader — a departed member's shared link must stop
  // working against *their* membership, not the original uploader's.
  private async rescopeMediaUrlForViewer(
    mediaUrl: string | null,
    viewerId: string,
  ): Promise<string | null> {
    if (!mediaUrl) return null;

    const local = mediaUrl.match(LOCAL_CHAT_FILE_URL_RE);
    if (local) {
      const fileKey = decodeURIComponent(local[1]);
      if (this.storage.isCloudinaryKey(fileKey)) {
        const fresh = this.storage.buildDeliveryUrl(fileKey);
        if (fresh) return fresh;
      }
      const token = await this.jwtService.signAsync(
        { sub: viewerId, fileKey, purpose: 'chat-file' },
        { expiresIn: '7d' },
      );
      return `/chat/files/${encodeURIComponent(fileKey)}?token=${token}`;
    }

    const cloud = mediaUrl.match(CLOUDINARY_DELIVERY_RE);
    if (cloud) {
      const resourceType = cloud[1] as 'image' | 'video';
      const publicId = decodeURIComponent(cloud[2].replace(/\/$/, ''));
      const fresh = this.storage.buildDeliveryUrl(
        `${resourceType}:${publicId}`,
      );
      if (fresh) return fresh;
    }

    return mediaUrl;
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

  private async loadReplyPreviews(ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))];
    const map = new Map<
      string,
      { id: string; text: string | null; senderName: string; mediaType: string | null }
    >();
    if (unique.length === 0) return map;
    const rows = await this.prisma.chatMessage.findMany({
      where: { id: { in: unique } },
      include: { sender: { select: { name: true } } },
    });
    for (const row of rows) {
      map.set(row.id, {
        id: row.id,
        text: row.text,
        senderName: row.sender.name,
        mediaType: row.mediaType,
      });
    }
    return map;
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
      editedAt?: Date | null;
      replyToId?: string | null;
    },
    senderName: string,
    senderMembership?: { role: MembershipRole; isOwner: boolean },
    replyTo?: {
      id: string;
      text: string | null;
      senderName: string;
      mediaType: string | null;
    },
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
      editedAt: message.editedAt ?? null,
      replyToId: message.replyToId ?? null,
      replyTo: replyTo
        ? {
            id: replyTo.id,
            text: replyTo.text,
            senderName: replyTo.senderName,
            mediaType: replyTo.mediaType,
          }
        : null,
    };
  }
}
