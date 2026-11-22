import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SetDirectVoiceDto } from './dto';

/** Page size cap so one call can never pull the whole table. */
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Platform-wide counts for the admin landing screen. */
  async overview() {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [orgs, users, verifiedUsers, admins, messages, scrims, newUsers] =
      await Promise.all([
        this.prisma.org.count(),
        this.prisma.user.count(),
        this.prisma.user.count({ where: { emailVerified: true } }),
        this.prisma.user.count({ where: { isPlatformAdmin: true } }),
        this.prisma.chatMessage.count(),
        this.prisma.scrimEvent.count(),
        this.prisma.user.count({ where: { createdAt: { gte: since } } }),
      ]);

    return {
      orgs,
      users,
      verifiedUsers,
      admins,
      messages,
      scrims,
      newUsersLast7Days: newUsers,
    };
  }

  /**
   * Every org on the platform, newest first. Read-only: this screen exists to
   * see what is going on, not to reach into someone's team.
   */
  async listOrgs(params: { search?: string; skip?: number; take?: number }) {
    const take = Math.min(params.take ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const skip = Math.max(params.skip ?? 0, 0);
    const where = params.search
      ? { name: { contains: params.search, mode: 'insensitive' as const } }
      : {};

    const [total, orgs] = await Promise.all([
      this.prisma.org.count({ where }),
      this.prisma.org.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          name: true,
          createdAt: true,
          _count: {
            select: {
              memberships: true,
              guildMemberships: true,
              chatMessages: true,
            },
          },
          memberships: {
            where: { isOwner: true },
            take: 1,
            select: { user: { select: { id: true, name: true, email: true } } },
          },
        },
      }),
    ]);

    return {
      total,
      skip,
      take,
      orgs: orgs.map((org) => ({
        id: org.id,
        name: org.name,
        createdAt: org.createdAt,
        rosterCount: org._count.memberships,
        guildCount: org._count.guildMemberships,
        messageCount: org._count.chatMessages,
        owner: org.memberships[0]?.user ?? null,
      })),
    };
  }

  /** One org in more detail — roster, and how active it is. */
  async orgDetail(orgId: string) {
    const org = await this.prisma.org.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: {
          select: {
            guildMemberships: true,
            chatMessages: true,
            scrimEvents: true,
            mediaPosts: true,
            playerStats: true,
          },
        },
        memberships: {
          orderBy: { createdAt: 'asc' },
          select: {
            role: true,
            isOwner: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                inGameName: true,
                avatarUrl: true,
                lastSeenAt: true,
              },
            },
          },
        },
      },
    });
    if (!org) throw new NotFoundException('Org not found');

    return {
      id: org.id,
      name: org.name,
      createdAt: org.createdAt,
      counts: {
        guildMembers: org._count.guildMemberships,
        messages: org._count.chatMessages,
        scrims: org._count.scrimEvents,
        mediaPosts: org._count.mediaPosts,
        playerStats: org._count.playerStats,
      },
      roster: org.memberships.map((m) => ({
        ...m.user,
        role: m.role,
        isOwner: m.isOwner,
        joinedAt: m.createdAt,
      })),
    };
  }

  /** Who currently holds platform admin — so a grant is never invisible. */
  async listAdmins() {
    return this.prisma.user.findMany({
      where: { isPlatformAdmin: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, email: true, createdAt: true },
    });
  }

  /**
   * Everyone who can use 1-on-1 voice. Same reasoning as listAdmins: a
   * permission nobody can see is a permission nobody can audit.
   */
  async listDirectVoiceUsers() {
    return this.prisma.user.findMany({
      where: { canDirectVoice: true },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        inGameName: true,
        avatarUrl: true,
        createdAt: true,
      },
    });
  }

  /**
   * Grant or revoke 1-on-1 voice. Addressed by email or user id — email is
   * what an admin actually has to hand.
   *
   * A grant on its own opens nothing: a call needs the flag on BOTH people,
   * checked server-side when the token is minted.
   */
  async setDirectVoice(dto: SetDirectVoiceDto) {
    const where = dto.userId
      ? { id: dto.userId }
      : { email: dto.email!.trim().toLowerCase() };
    const user = await this.prisma.user.findUnique({
      where,
      select: { id: true, canDirectVoice: true },
    });
    if (!user) {
      throw new NotFoundException(
        dto.userId
          ? 'No user with that id'
          : `No user signed up with ${dto.email}`,
      );
    }
    if (user.canDirectVoice === dto.enabled) {
      return { userId: user.id, canDirectVoice: user.canDirectVoice };
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { canDirectVoice: dto.enabled },
      select: { id: true, name: true, email: true, canDirectVoice: true },
    });
    this.logger.log(
      `direct voice ${dto.enabled ? 'granted to' : 'revoked from'} ${updated.email}`,
    );
    return {
      userId: updated.id,
      name: updated.name,
      email: updated.email,
      canDirectVoice: updated.canDirectVoice,
    };
  }
}
