import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatPresenceTracker } from '../chat/chat-presence.tracker';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import {
  BlockUserDto,
  DeleteOrgDto,
  DeleteUserDto,
  SetDirectVoiceDto,
} from './dto';

/** Page size cap so one call can never pull the whole table. */
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One line in the health panel.
 *
 * `kind` matters more than it looks: 'live' means we actually talked to the
 * thing just now, 'config' means we only know whether its credentials are
 * present on this host. Labelling a config check as if it were a probe is
 * how a dashboard ends up lying about a service that is configured but down,
 * so the two are kept distinct all the way to the UI.
 */
export interface AdminServiceCheck {
  key: string;
  label: string;
  status: 'up' | 'down' | 'off';
  kind: 'live' | 'config';
  detail: string;
  latencyMs?: number;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly presence: ChatPresenceTracker,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Platform-wide counts for the admin landing screen.
   *
   * "Active" is measured from User.lastSeenAt, which the chat gateway stamps
   * on every socket connect — so it survives a backend restart, unlike the
   * in-memory `onlineNow`. The two answer different questions on purpose:
   * onlineNow is "who has the app open this second", active24h is "who used
   * the platform today".
   */
  async overview() {
    const now = Date.now();
    const since24h = new Date(now - DAY_MS);
    const since7d = new Date(now - 7 * DAY_MS);
    const since30d = new Date(now - 30 * DAY_MS);

    const [
      orgs,
      users,
      verifiedUsers,
      admins,
      messages,
      scrims,
      newUsers,
      newUsers24h,
      guildMembers,
      rosterMembers,
      activeUsers24h,
      activeUsers7d,
      activeUsers30d,
      pendingJoinRequests,
    ] = await Promise.all([
      this.prisma.org.count(),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { emailVerified: true } }),
      this.prisma.user.count({ where: { isPlatformAdmin: true } }),
      this.prisma.chatMessage.count(),
      this.prisma.scrimEvent.count(),
      this.prisma.user.count({ where: { createdAt: { gte: since7d } } }),
      this.prisma.user.count({ where: { createdAt: { gte: since24h } } }),
      this.prisma.guildMembership.count(),
      this.prisma.membership.count(),
      this.prisma.user.count({ where: { lastSeenAt: { gte: since24h } } }),
      this.prisma.user.count({ where: { lastSeenAt: { gte: since7d } } }),
      this.prisma.user.count({ where: { lastSeenAt: { gte: since30d } } }),
      this.prisma.guildJoinRequest.count({ where: { status: 'PENDING' } }),
    ]);

    return {
      orgs,
      users,
      verifiedUsers,
      admins,
      messages,
      scrims,
      newUsersLast7Days: newUsers,
      newUsersLast24Hours: newUsers24h,
      guildMembers,
      rosterMembers,
      activeUsers24h,
      activeUsers7d,
      activeUsers30d,
      onlineNow: this.presence.onlineCount(),
      pendingJoinRequests,
    };
  }

  /**
   * Every org on the platform, newest first. Read-only: this screen exists to
   * see what is going on, not to reach into someone's team.
   */
  async listOrgs(params: { search?: string; skip?: number; take?: number }) {
    const take = Math.min(params.take ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const skip = Math.max(params.skip ?? 0, 0);
    const search = params.search?.trim();
    // Name, join code, or the owner's name/email — an admin chasing a report
    // usually has one of those three, not the guild's exact name.
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { orgCode: { contains: search, mode: 'insensitive' as const } },
            {
              memberships: {
                some: {
                  isOwner: true,
                  user: {
                    OR: [
                      {
                        name: {
                          contains: search,
                          mode: 'insensitive' as const,
                        },
                      },
                      {
                        email: {
                          contains: search,
                          mode: 'insensitive' as const,
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        }
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
          orgCode: true,
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
        orgCode: org.orgCode,
        createdAt: org.createdAt,
        rosterCount: org._count.memberships,
        guildCount: org._count.guildMemberships,
        messageCount: org._count.chatMessages,
        owner: org.memberships[0]?.user ?? null,
      })),
    };
  }

  /**
   * One guild in detail — both member lists, and how active it is.
   *
   * Two lists, not one: `guild` is the community side (GuildMembership, how
   * most people join) and `roster` is the esports side (Membership). A person
   * can be in either, both, or one and not the other, so collapsing them into
   * a single list would quietly misreport who is actually in a guild.
   */
  async orgDetail(orgId: string) {
    const memberUserSelect = {
      id: true,
      name: true,
      email: true,
      // So the admin can grant 1-on-1 voice from the member row itself,
      // rather than copying an email into a separate form.
      canDirectVoice: true,
      // Needed only for the org-wide "active in last 24h" count below —
      // stripped back out per-member in mergeMembers() before it reaches
      // the member list the admin actually sees.
      lastSeenAt: true,
    } as const;

    const org = await this.prisma.org.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        name: true,
        orgCode: true,
        rosterCode: true,
        createdAt: true,
        _count: {
          select: {
            guildMemberships: true,
            memberships: true,
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
            user: { select: memberUserSelect },
          },
        },
        guildMemberships: {
          orderBy: { createdAt: 'asc' },
          select: {
            role: true,
            createdAt: true,
            user: { select: memberUserSelect },
          },
        },
        guildJoinRequests: {
          where: { status: 'PENDING' },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            createdAt: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });
    if (!org) throw new NotFoundException('Org not found');

    const owner =
      org.memberships.find((m) => m.isOwner)?.user ?? null;
    const since24h = new Date(Date.now() - DAY_MS);
    const activeGuildMembers = org.guildMemberships.filter(
      (m) => m.user.lastSeenAt && m.user.lastSeenAt >= since24h,
    ).length;

    return {
      id: org.id,
      name: org.name,
      orgCode: org.orgCode,
      rosterCode: org.rosterCode,
      createdAt: org.createdAt,
      owner: owner && {
        id: owner.id,
        name: owner.name,
        email: owner.email,
      },
      counts: {
        guildMembers: org._count.guildMemberships,
        rosterMembers: org._count.memberships,
        activeGuildMembers24h: activeGuildMembers,
        messages: org._count.chatMessages,
        scrims: org._count.scrimEvents,
        mediaPosts: org._count.mediaPosts,
        playerStats: org._count.playerStats,
        pendingJoinRequests: org.guildJoinRequests.length,
      },
      // One list, not two.
      //
      // Joining the roster also creates a guild seat, so the two lists were
      // almost entirely the same people shown twice. Almost: someone already
      // in another guild keeps it when they join this roster
      // (OrgService.joinOrg), so they appear on the roster and NOT in the
      // guild. Dropping the roster list outright would make that person
      // invisible to an admin, so they are folded in here and flagged instead.
      members: this.mergeMembers(org.guildMemberships, org.memberships),
      pendingRequests: org.guildJoinRequests.map((r) => ({
        id: r.id,
        requestedAt: r.createdAt,
        user: r.user,
      })),
    };
  }

  /**
   * Delete one guild, and everything inside it.
   *
   * Every related table cascades from Org (chat, media, stats, scrims, maps,
   * announcements, both membership tables), so this is not recoverable from
   * the app — only from a database backup. Three things guard it:
   *
   *  1. platform admin only, checked against the database by the guard,
   *  2. the exact guild name has to be typed back, so a mis-tap on a row in
   *     a list cannot do it, and
   *  3. every member is told on their own realtime channel before the row
   *     goes, so their app moves them to the join screen instead of sitting
   *     on a guild that no longer exists.
   */
  async deleteOrg(adminUserId: string, orgId: string, dto: DeleteOrgDto) {
    const org = await this.prisma.org.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            memberships: true,
            guildMemberships: true,
            chatMessages: true,
            mediaPosts: true,
            scrimEvents: true,
          },
        },
      },
    });
    if (!org) throw new NotFoundException('Guild not found');

    // Compared after trimming but case-sensitively: two guilds differing only
    // in case are different guilds, and this is the one place that must not
    // be forgiving about which one you meant.
    if (dto.confirmName.trim() !== org.name) {
      throw new BadRequestException(
        'Type the guild name exactly as shown to confirm deletion',
      );
    }

    // Collected BEFORE the delete — once the rows are gone there is no way
    // left to find out who used to be in it.
    const members = await this.recipientIdsForOrg(orgId);

    await this.prisma.org.delete({ where: { id: orgId } });

    this.logger.warn(
      `Guild "${org.name}" (${orgId}) deleted by admin ${adminUserId} — ` +
        `${members.length} member(s), ${org._count.chatMessages} message(s)`,
    );

    // After the delete, so a client that reacts instantly re-reads /auth/me
    // and finds the guild genuinely gone rather than racing the deletion.
    for (const userId of members) {
      this.realtime.publishToUser(userId, 'membership.changed');
    }

    return {
      id: org.id,
      name: org.name,
      removed: {
        members: members.length,
        rosterSeats: org._count.memberships,
        guildSeats: org._count.guildMemberships,
        messages: org._count.chatMessages,
        mediaPosts: org._count.mediaPosts,
        scrims: org._count.scrimEvents,
      },
    };
  }

  /** Everyone holding either seat in this org, de-duplicated. */
  private async recipientIdsForOrg(orgId: string): Promise<string[]> {
    const [roster, guild] = await Promise.all([
      this.prisma.membership.findMany({
        where: { orgId },
        select: { userId: true },
      }),
      this.prisma.guildMembership.findMany({
        where: { orgId },
        select: { userId: true },
      }),
    ]);
    return [
      ...new Set([
        ...roster.map((m) => m.userId),
        ...guild.map((m) => m.userId),
      ]),
    ];
  }

  /**
   * The account an admin is about to act on, with the two refusals that apply
   * to every one of these actions.
   *
   * An admin may not act on themselves (locking yourself out of the only
   * account that can unlock anything is unrecoverable from inside the app),
   * and may not act on another platform admin — admin-on-admin moderation
   * belongs in the database, with someone who has server access, not in a
   * list row behind one tap.
   */
  private async targetUser(adminUserId: string, userId: string) {
    if (userId === adminUserId) {
      throw new BadRequestException('You cannot do that to your own account');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        isPlatformAdmin: true,
        blockedAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.isPlatformAdmin) {
      throw new ForbiddenException(
        'Another platform admin cannot be blocked or deleted from here',
      );
    }
    return user;
  }

  /**
   * Block an account. Takes effect on the blocked user's next request, not
   * when their token expires — JwtStrategy re-reads this column every time.
   * tokenVersion is also bumped so any cached session is invalid immediately.
   */
  async blockUser(adminUserId: string, userId: string, dto: BlockUserDto) {
    const user = await this.targetUser(adminUserId, userId);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        blockedAt: new Date(),
        blockedReason: dto.reason?.trim() || null,
        tokenVersion: { increment: 1 },
      },
      select: { id: true, name: true, email: true, blockedAt: true, blockedReason: true },
    });
    this.logger.warn(
      `User ${updated.email} blocked by admin ${adminUserId}${
        updated.blockedReason ? ` — ${updated.blockedReason}` : ''
      }`,
    );
    return updated;
  }

  /** Lift a block. The account can sign in again from the next attempt. */
  async unblockUser(adminUserId: string, userId: string) {
    const user = await this.targetUser(adminUserId, userId);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { blockedAt: null, blockedReason: null },
      select: { id: true, name: true, email: true, blockedAt: true },
    });
    this.logger.log(`User ${updated.email} unblocked by admin ${adminUserId}`);
    return updated;
  }

  /**
   * Delete an account outright. Everything owned by it cascades away with it;
   * things merely authored by it (an announcement, an invite attribution)
   * survive with a null author, which is why org history does not vanish when
   * a member leaves the platform.
   *
   * Not recoverable from the app — only from a database backup.
   */
  async deleteUser(adminUserId: string, userId: string, dto: DeleteUserDto) {
    const user = await this.targetUser(adminUserId, userId);
    // Compared case-insensitively: emails are already stored lowercased, and
    // an admin typing their own capitalisation should not be told they got it
    // wrong. The guild-delete check is case-sensitive because two guilds may
    // legitimately differ only by case; two accounts cannot.
    if (dto.confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
      throw new BadRequestException(
        'Type the account email exactly as shown to confirm deletion',
      );
    }

    const orgIds = await this.prisma.membership.findMany({
      where: { userId: user.id },
      select: { orgId: true },
    });

    await this.prisma.user.delete({ where: { id: user.id } });
    this.logger.warn(
      `User ${user.email} (${user.id}) deleted by admin ${adminUserId}`,
    );

    // Their old teammates' rosters just changed under them.
    for (const { orgId } of orgIds) {
      this.realtime.publish(orgId, 'members.changed');
    }
    return { id: user.id, name: user.name, email: user.email };
  }

  /**
   * Guild seats and roster seats as one list, each row saying which seats it
   * holds. Guild order is kept (that is the community everyone joins first);
   * anyone holding only a roster seat is appended.
   */
  private mergeMembers(
    guildMemberships: {
      role: string;
      createdAt: Date;
      user: { id: string } & Record<string, unknown>;
    }[],
    memberships: {
      role: string | null;
      isOwner: boolean;
      createdAt: Date;
      user: { id: string } & Record<string, unknown>;
    }[],
  ) {
    // lastSeenAt rides along in memberUserSelect purely for the org-wide
    // "active in last 24h" count computed before this runs — drop it here so
    // it never reaches the member list itself.
    const dropLastSeen = ({ lastSeenAt: _lastSeenAt, ...rest }: Record<string, unknown>) =>
      rest;

    const rosterByUser = new Map(memberships.map((m) => [m.user.id, m]));
    const merged = guildMemberships.map((m) => {
      const roster = rosterByUser.get(m.user.id);
      rosterByUser.delete(m.user.id);
      return {
        ...dropLastSeen(m.user),
        guildRole: m.role,
        onRoster: !!roster,
        rosterRole: roster?.role ?? null,
        isOwner: roster?.isOwner ?? false,
        inGuild: true,
      };
    });

    for (const roster of rosterByUser.values()) {
      merged.push({
        ...dropLastSeen(roster.user),
        guildRole: null as never,
        onRoster: true,
        rosterRole: roster.role,
        isOwner: roster.isOwner,
        // Flagged so the dashboard can say "on the roster but in another
        // guild" rather than silently listing them as a guild member.
        inGuild: false,
      });
    }
    return merged;
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
   *
   * Each row carries the person's guild because a call needs both sides in
   * the SAME guild — without it an admin can grant two people the permission,
   * see two green rows, and have no idea why they still cannot reach each
   * other. The UI groups by guild for exactly that reason.
   */
  async listDirectVoiceUsers() {
    const users = await this.prisma.user.findMany({
      where: { canDirectVoice: true },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        guildMemberships: {
          take: 1,
          select: { org: { select: { id: true, name: true } } },
        },
      },
    });

    return users.map(({ guildMemberships, ...user }) => ({
      ...user,
      guild: guildMemberships[0]?.org ?? null,
    }));
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
    // Personal channel — they may already have the app open with a stale
    // canDirectVoice flag; this is what flips the drawer + DM call icon live.
    this.realtime.publishToUser(updated.id, 'directVoice.changed');
    return {
      userId: updated.id,
      name: updated.name,
      email: updated.email,
      canDirectVoice: updated.canDirectVoice,
    };
  }

  /**
   * Backend service health for the admin dashboard.
   *
   * Only the database and the realtime gateway are genuinely probed here —
   * everything else is a credentials check on this host, marked kind:'config'
   * so the UI can say so rather than implying a green light it did not earn.
   * Deliberately no outbound calls to Resend/Cloudinary/LiveKit: an admin
   * refreshing this page should never be able to burn third-party quota or
   * hang the request behind someone else's timeout.
   */
  async health() {
    const database = await this.checkDatabase();
    const services: AdminServiceCheck[] = [
      database,
      this.checkRealtime(),
      this.checkEmail(),
      this.checkMediaStorage(),
      this.checkVoice(),
      this.checkStatsAi(),
      this.checkPhoneVerify(),
      this.checkGoogleSignIn(),
    ];

    const uptimeSeconds = Math.round(process.uptime());
    const memory = process.memoryUsage();

    // Only a failed *probe* makes the backend "down". A missing credential is
    // a real problem (the per-service row says so, and the dashboard counts
    // them) but it is a deployment gap, not an outage — conflating the two
    // would leave this screen permanently red on any host that deliberately
    // runs without, say, LiveKit.
    const liveDown = services.some(
      (c) => c.kind === 'live' && c.status === 'down',
    );

    return {
      checkedAt: new Date().toISOString(),
      status: liveDown ? 'down' : 'ok',
      needsAttention: services.filter((c) => c.status === 'down').length,
      process: {
        env: process.env.NODE_ENV ?? 'development',
        nodeVersion: process.version,
        uptimeSeconds,
        startedAt: new Date(Date.now() - uptimeSeconds * 1000).toISOString(),
        memoryMb: Math.round(memory.rss / 1024 / 1024),
        heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
      },
      services,
    };
  }

  private async checkDatabase(): Promise<AdminServiceCheck> {
    const started = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        key: 'database',
        label: 'PostgreSQL',
        status: 'up',
        kind: 'live',
        latencyMs: Date.now() - started,
        detail: 'Query answered',
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unreachable';
      this.logger.error(`Database health check failed: ${message}`);
      return {
        key: 'database',
        label: 'PostgreSQL',
        status: 'down',
        kind: 'live',
        latencyMs: Date.now() - started,
        // Driver errors can carry the connection string; only the first line
        // is kept and it is never widened beyond admins.
        detail: message.split('\n')[0].slice(0, 200),
      };
    }
  }

  private checkRealtime(): AdminServiceCheck {
    const users = this.presence.onlineCount();
    const sockets = this.presence.socketCount();
    return {
      key: 'realtime',
      label: 'Realtime gateway',
      status: 'up',
      kind: 'live',
      detail: `${users} user${users === 1 ? '' : 's'} connected · ${sockets} socket${sockets === 1 ? '' : 's'}`,
    };
  }

  private checkEmail(): AdminServiceCheck {
    const configured =
      !!this.config.get<string>('RESEND_API_KEY')?.trim() &&
      !!this.config.get<string>('RESEND_FROM_EMAIL')?.trim();
    return {
      key: 'email',
      label: 'Email (Resend)',
      status: configured ? 'up' : 'down',
      kind: 'config',
      detail: configured
        ? `Sending as ${this.config.get<string>('RESEND_FROM_EMAIL')?.trim()}`
        : 'RESEND_API_KEY / RESEND_FROM_EMAIL missing — signup OTP and password emails will fail',
    };
  }

  private checkMediaStorage(): AdminServiceCheck {
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME')?.trim();
    const key = this.config.get<string>('CLOUDINARY_API_KEY')?.trim();
    const secret = this.config.get<string>('CLOUDINARY_API_SECRET')?.trim();
    if (cloudName && key && secret) {
      return {
        key: 'media',
        label: 'Media storage',
        status: 'up',
        kind: 'config',
        detail: `Cloudinary (${cloudName})`,
      };
    }
    return {
      key: 'media',
      label: 'Media storage',
      status: 'down',
      kind: 'config',
      // Not a nitpick: on Render's disk this is actual data loss on restart,
      // which is exactly the kind of thing this panel exists to surface.
      detail:
        'Cloudinary not configured — uploads go to local disk, which is ephemeral on a PaaS host',
    };
  }

  private checkVoice(): AdminServiceCheck {
    const selfHosted =
      (this.config.get<string>('VOICE_SELF_HOSTED') ?? '').trim() === 'true';
    if (selfHosted) {
      return {
        key: 'voice',
        label: 'Voice',
        status: 'up',
        kind: 'config',
        detail: 'Self-hosted (mediasoup)',
      };
    }
    const configured =
      !!this.config.get<string>('LIVEKIT_URL')?.trim() &&
      !!this.config.get<string>('LIVEKIT_API_KEY')?.trim() &&
      !!this.config.get<string>('LIVEKIT_API_SECRET')?.trim();
    return {
      key: 'voice',
      label: 'Voice (LiveKit)',
      status: configured ? 'up' : 'off',
      kind: 'config',
      detail: configured
        ? (this.config.get<string>('LIVEKIT_URL')?.trim() ?? 'Configured')
        : 'LIVEKIT_* not set — voice calls unavailable',
    };
  }

  private checkStatsAi(): AdminServiceCheck {
    const configured = !!this.config.get<string>('GEMINI_API_KEY')?.trim();
    return {
      key: 'stats-ai',
      label: 'Stats OCR (Gemini)',
      status: configured ? 'up' : 'off',
      kind: 'config',
      detail: configured
        ? 'API key present'
        : 'GEMINI_API_KEY not set — scoreboard extraction disabled',
    };
  }

  private checkPhoneVerify(): AdminServiceCheck {
    const configured =
      !!this.config.get<string>('TELEGRAM_BOT_TOKEN')?.trim() &&
      !!this.config.get<string>('TELEGRAM_BOT_USERNAME')?.trim();
    return {
      key: 'phone-verify',
      label: 'Phone verify (Telegram)',
      status: configured ? 'up' : 'off',
      kind: 'config',
      detail: configured
        ? `@${this.config.get<string>('TELEGRAM_BOT_USERNAME')?.trim()}`
        : 'TELEGRAM_BOT_TOKEN / USERNAME not set — phone verification disabled',
    };
  }

  private checkGoogleSignIn(): AdminServiceCheck {
    const configured = !!this.config.get<string>('GOOGLE_CLIENT_ID')?.trim();
    return {
      key: 'google',
      label: 'Google sign-in',
      status: configured ? 'up' : 'off',
      kind: 'config',
      detail: configured
        ? 'Client ID present'
        : 'GOOGLE_CLIENT_ID not set — Google sign-in disabled',
    };
  }

}
