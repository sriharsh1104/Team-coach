import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationService } from '../common/push-notification.service';
import { parsePushTokens } from '../common/push-tokens';
import { CreateAnnouncementDto } from './dto';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
/** Android collapses a long body anyway; keep the tray line readable. */
const PUSH_BODY_LIMIT = 160;

function truncate(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 1)}…`;
}

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushNotifications: PushNotificationService,
  ) {}

  /**
   * The org this person belongs to, from either seat.
   *
   * Announcements are read by anyone in the org — guild-only members
   * included, since the guild side is where most people actually live.
   */
  private async requireOrgId(userId: string): Promise<string> {
    const [roster, guild] = await Promise.all([
      this.prisma.membership.findFirst({
        where: { userId },
        select: { orgId: true },
      }),
      this.prisma.guildMembership.findFirst({
        where: { userId },
        select: { orgId: true },
      }),
    ]);
    const orgId = roster?.orgId ?? guild?.orgId;
    if (!orgId) throw new NotFoundException('You are not part of a guild yet');
    return orgId;
  }

  /**
   * Posting is the org owner's alone. Not coaches: an announcement pushes to
   * every single member's phone, which is the loudest thing anyone can do in
   * this app, so it stays with the one person who owns the org.
   */
  private async requireOwnedOrgId(userId: string): Promise<string> {
    const owner = await this.prisma.membership.findFirst({
      where: { userId, isOwner: true },
      select: { orgId: true },
    });
    if (!owner) {
      throw new ForbiddenException('Only the guild owner can post announcements');
    }
    return owner.orgId;
  }

  /**
   * Everyone who should receive this org's announcements.
   *
   * The union of both seats on purpose. They are *nearly* the same set —
   * joining the roster creates a guild seat too — but not quite: someone who
   * was already in another guild keeps it when they join this roster
   * (OrgService.joinOrg), so a guild-only query would silently skip them.
   */
  private async recipientIds(orgId: string): Promise<string[]> {
    const [guild, roster] = await Promise.all([
      this.prisma.guildMembership.findMany({
        where: { orgId },
        select: { userId: true },
      }),
      this.prisma.membership.findMany({
        where: { orgId },
        select: { userId: true },
      }),
    ]);
    return [
      ...new Set([
        ...guild.map((m) => m.userId),
        ...roster.map((m) => m.userId),
      ]),
    ];
  }

  /** Post one announcement and push it to every member. */
  async create(userId: string, dto: CreateAnnouncementDto) {
    const orgId = await this.requireOwnedOrgId(userId);
    const announcement = await this.prisma.announcement.create({
      data: {
        orgId,
        authorId: userId,
        title: dto.title.trim(),
        body: dto.body.trim(),
      },
      select: {
        id: true,
        title: true,
        body: true,
        createdAt: true,
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    // The author has obviously read their own post — otherwise their own
    // announcement shows up as unread to them the moment they send it.
    await this.prisma.announcementRead.create({
      data: { announcementId: announcement.id, userId },
    });

    await this.pushToMembers(orgId, userId, announcement.id, dto);

    return { ...announcement, read: true };
  }

  /**
   * Push is fire-and-forget relative to the post: a failing Expo call must
   * never lose an announcement that is already saved and visible in-app.
   */
  private async pushToMembers(
    orgId: string,
    authorId: string,
    announcementId: string,
    dto: CreateAnnouncementDto,
  ) {
    try {
      const recipients = await this.recipientIds(orgId);
      const users = await this.prisma.user.findMany({
        where: { id: { in: recipients.filter((id) => id !== authorId) } },
        select: { expoPushToken: true },
      });
      const [org] = await Promise.all([
        this.prisma.org.findUnique({
          where: { id: orgId },
          select: { name: true },
        }),
      ]);

      const messages = users.flatMap((u) =>
        parsePushTokens(u.expoPushToken).map((to) => ({
          to,
          title: `${org?.name ?? 'Your guild'}: ${truncate(dto.title, 60)}`,
          body: truncate(dto.body, PUSH_BODY_LIMIT),
          data: { type: 'announcement', announcementId, orgId },
          // One tray entry per announcement, not per device re-send.
          collapseId: `announcement:${announcementId}`,
          channelId: 'announcements',
          priority: 'high' as const,
          // Deliberately NO reply category: an announcement is a broadcast,
          // and a reply from the shade would have nowhere to land.
        })),
      );
      await this.pushNotifications.send(messages);
    } catch (err) {
      this.logger.error(
        `Announcement ${announcementId} saved but its push failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** One page of this org's announcements, newest first, with read state. */
  async list(userId: string, params: { skip?: number; take?: number }) {
    const orgId = await this.requireOrgId(userId);
    const take = Math.min(params.take ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const skip = Math.max(params.skip ?? 0, 0);

    const isOwner = await this.prisma.membership.findFirst({
      where: { userId, orgId, isOwner: true },
      select: { id: true },
    });

    const [total, rows, unread] = await Promise.all([
      this.prisma.announcement.count({ where: { orgId } }),
      this.prisma.announcement.findMany({
        where: { orgId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          title: true,
          body: true,
          createdAt: true,
          author: { select: { id: true, name: true, avatarUrl: true } },
          // Only this user's row — `read` is per-person, so the list must
          // never leak whether anyone else has opened it.
          reads: { where: { userId }, select: { id: true }, take: 1 },
        },
      }),
      this.unreadCount(orgId, userId),
    ]);

    return {
      total,
      skip,
      take,
      unread,
      canPost: !!isOwner,
      announcements: rows.map(({ reads, ...row }) => ({
        ...row,
        read: reads.length > 0,
      })),
    };
  }

  private unreadCount(orgId: string, userId: string) {
    return this.prisma.announcement.count({
      where: { orgId, reads: { none: { userId } } },
    });
  }

  /** Badge count for the nav item, without pulling the list itself. */
  async unread(userId: string) {
    const orgId = await this.requireOrgId(userId);
    return { unread: await this.unreadCount(orgId, userId) };
  }

  /**
   * Mark everything in this org read — what opening the section does.
   * `createMany` + skipDuplicates so re-opening is a no-op rather than a
   * unique-constraint error.
   */
  async markAllRead(userId: string) {
    const orgId = await this.requireOrgId(userId);
    const unreadRows = await this.prisma.announcement.findMany({
      where: { orgId, reads: { none: { userId } } },
      select: { id: true },
    });
    if (unreadRows.length > 0) {
      await this.prisma.announcementRead.createMany({
        data: unreadRows.map((a) => ({ announcementId: a.id, userId })),
        skipDuplicates: true,
      });
    }
    return { marked: unreadRows.length };
  }

  /** Owner-only delete, scoped to their own org. */
  async remove(userId: string, announcementId: string) {
    const orgId = await this.requireOwnedOrgId(userId);
    const existing = await this.prisma.announcement.findFirst({
      where: { id: announcementId, orgId },
      select: { id: true },
    });
    // Scoped lookup, so an owner probing another org's id gets the same
    // 404 as a id that does not exist at all.
    if (!existing) throw new NotFoundException('Announcement not found');
    await this.prisma.announcement.delete({ where: { id: announcementId } });
    return { id: announcementId };
  }
}
