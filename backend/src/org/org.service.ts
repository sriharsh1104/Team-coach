import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { customAlphabet } from 'nanoid';
import {
  GuildJoinRequestStatus,
  GuildRole,
  MembershipRole,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  PushMessage,
  PushNotificationService,
} from '../common/push-notification.service';
import { RealtimeService } from '../realtime/realtime.service';
import { MediaStorageService } from '../media/media-storage.service';
import { CreateOrgDto } from './dto/create-org.dto';
import { CreateAchievementDto } from './dto/create-achievement.dto';
import { JoinOrgDto } from './dto/join-org.dto';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { RemoveMemberDto } from './dto/remove-member.dto';
import { AddRosterMemberDto } from './dto/add-roster-member.dto';
import { SetOwnRosterRoleDto } from './dto/set-own-roster-role.dto';

// Independent per-role caps. An owner with no roster role does not take a
// seat. If they later choose one, that seat counts here. Roster shape the
// product targets: 1 owner + up to 2 coaches + 1 analyst + 5 players.
// Joiners always enter as PLAYER; only the owner can promote/demote.
const ROLE_CAPS: Partial<Record<MembershipRole, number>> = {
  [MembershipRole.COACH]: 2,
  [MembershipRole.ANALYST]: 1,
  [MembershipRole.PLAYER]: 5,
};

// Unambiguous uppercase alphabet (no 0/O/1/I) for a code players type by hand.
// 8 chars (32^8 ≈ 1.1 trillion combinations) rather than 6 (≈1.07 billion) —
// the 5/min-per-IP join throttle (org.controller.ts) only resists a single
// attacker IP; a wider keyspace is what actually matters against a
// distributed guesser spread across many IPs.
// Mirrors ChatService.GUILD_CHANNEL — imported by value would drag the whole
// chat module into OrgModule for one string.
const GUILD_CHANNEL_KEY = 'guild';

const generateOrgCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);
const generateReferralToken = customAlphabet(
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  24,
);

/** Accept raw tokens or pasted invite URLs like https://app/join/TOKEN. */
export function normalizeReferralToken(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  try {
    if (trimmed.includes('://') || trimmed.startsWith('/join/')) {
      const url = trimmed.includes('://')
        ? new URL(trimmed)
        : new URL(trimmed, 'https://placeholder.local');
      const parts = url.pathname.split('/').filter(Boolean);
      const joinIdx = parts.indexOf('join');
      if (joinIdx >= 0 && parts[joinIdx + 1]) {
        return decodeURIComponent(parts[joinIdx + 1]);
      }
      const fromQuery = url.searchParams.get('token');
      if (fromQuery) return fromQuery.trim();
    }
  } catch {
    /* fall through */
  }

  const pathMatch = trimmed.match(/(?:^|\/)join\/([A-Za-z0-9_-]+)/);
  if (pathMatch) return pathMatch[1];
  return trimmed;
}

function referralLinkFor(
  token: string,
  opts?: { invitedByUserId?: string; seat?: 'guild' | 'roster' },
) {
  const base = (process.env.WEB_PUBLIC_URL || 'http://localhost:5173').replace(
    /\/$/,
    '',
  );
  const url = new URL(`${base}/join/${token}`);
  if (opts?.seat === 'roster') url.searchParams.set('seat', 'roster');
  if (opts?.invitedByUserId) {
    url.searchParams.set('ref', opts.invitedByUserId);
  }
  return url.toString();
}

/** Pull `ref` (inviter user id) from a pasted invite URL, if present. */
export function extractInviteRef(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;
  const trimmed = raw.trim();
  try {
    if (trimmed.includes('://') || trimmed.startsWith('/join/')) {
      const url = trimmed.includes('://')
        ? new URL(trimmed)
        : new URL(trimmed, 'http://localhost');
      const ref = url.searchParams.get('ref')?.trim();
      return ref || undefined;
    }
  } catch {
    /* fall through */
  }
  const match = trimmed.match(/[?&]ref=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

/** `seat=roster` on invite URLs → join guild + esports roster. */
export function extractInviteSeat(raw?: string): 'guild' | 'roster' {
  if (!raw?.trim()) return 'guild';
  const trimmed = raw.trim();
  try {
    if (
      trimmed.includes('://') ||
      trimmed.startsWith('/join/') ||
      trimmed.includes('?')
    ) {
      const url = trimmed.includes('://')
        ? new URL(trimmed)
        : new URL(
            trimmed.startsWith('/')
              ? trimmed
              : `/?${trimmed.replace(/^\?/, '')}`,
            'http://localhost',
          );
      if (url.searchParams.get('seat') === 'roster') return 'roster';
    }
  } catch {
    /* fall through */
  }
  return /[?&]seat=roster(?:&|$)/.test(trimmed) ? 'roster' : 'guild';
}

@Injectable()
export class OrgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly pushNotifications: PushNotificationService,
    private readonly storage: MediaStorageService,
    private readonly jwtService: JwtService,
  ) {}

  private notifyMembersChanged(orgId: string) {
    this.realtime.publish(orgId, 'members.changed');
  }

  /**
   * Tell one person their own seat moved, on their personal channel.
   * The org channel is no good here: someone just accepted into a guild was
   * not listening to it a moment ago, and someone just removed is not
   * listening to it any more. Without this the app only caught up on the
   * next cold start — which is exactly what "band karke aane pe aaya" was.
   */
  private notifyMembershipChanged(userId: string, orgId?: string) {
    this.realtime.publishToUser(userId, 'membership.changed', orgId);
  }

  async createOrg(userId: string, dto: CreateOrgDto) {
    await this.assertUserHasNoOrg(userId);

    const name = dto.name.trim();
    const existingName = await this.prisma.org.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existingName) {
      throw new ConflictException('An org with that name already exists');
    }

    const freeFireGuildId = normalizeFreeFireGuildId(dto.freeFireGuildId);

    try {
      const org = await this.prisma.$transaction(async (tx) => {
        const createdOrg = await tx.org.create({
          data: {
            name,
            orgCode: generateOrgCode(),
            referralToken: generateReferralToken(),
            rosterCode: generateOrgCode(),
            rosterReferralToken: generateReferralToken(),
            freeFireGuildId,
          },
        });

        await tx.membership.create({
          data: {
            userId,
            orgId: createdOrg.id,
            // The person creating the org is almost always the team's coach —
            // default them there instead of leaving the role unset.
            role: dto.role ?? MembershipRole.COACH,
            isOwner: true,
          },
        });
        await tx.guildMembership.create({
          data: {
            userId,
            orgId: createdOrg.id,
            role: GuildRole.LEADER,
          },
        });

        return createdOrg;
      });

      return this.toOrgResponse(org, dto.role ?? null, true);
    } catch (err) {
      // Race on name, or vanishingly rare orgCode collision.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const target = err.meta?.target;
        const fields = Array.isArray(target)
          ? target.join(',')
          : String(target ?? '');
        if (fields.includes('name')) {
          throw new ConflictException('An org with that name already exists');
        }
        if (
          fields.includes('orgCode') ||
          fields.includes('rosterCode') ||
          fields.includes('referralToken') ||
          fields.includes('rosterReferralToken')
        ) {
          throw new ConflictException(
            'Could not allocate a unique invite code — please try again',
          );
        }
        if (fields.includes('userId')) {
          this.rethrowAsConflictOnDuplicateMembership(err);
        }
        throw new ConflictException('That org value is already in use');
      }
      throw err;
    }
  }

  async setOwnRosterRole(userId: string, dto: SetOwnRosterRoleDto) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId },
    });
    if (!membership) {
      throw new NotFoundException('You are not part of an org yet');
    }
    if (!membership.isOwner) {
      throw new ForbiddenException(
        'Only the owner can choose their roster role',
      );
    }

    const role = dto.role ?? null;
    if (membership.role === role) {
      return { role };
    }

    if (role) {
      await this.prisma.$transaction(async (tx) => {
        await this.lockOrgRoster(tx, membership.orgId);
        const cap = ROLE_CAPS[role];
        if (cap !== undefined) {
          const currentCount = await tx.membership.count({
            where: {
              orgId: membership.orgId,
              role,
              userId: { not: userId },
            },
          });
          if (currentCount >= cap) {
            throw new ConflictException(
              `This org already has the maximum of ${cap} ${role.toLowerCase()}(s)`,
            );
          }
        }
        await tx.membership.update({
          where: { id: membership.id },
          data: { role },
        });
      });
    } else {
      await this.prisma.membership.update({
        where: { id: membership.id },
        data: { role: null },
      });
    }

    return { role };
  }

  /**
   * Esports roster invite. Looks up by rosterCode / rosterReferralToken
   * (never guild orgCode). Existing platform users with no other org/guild
   * can join; already-in-guild (same org) users get a roster seat only.
   */
  async joinOrg(userId: string, dto: JoinOrgDto) {
    const rosterCode = (dto.rosterCode || dto.orgCode)?.trim();
    if (!rosterCode && !dto.referralToken) {
      throw new BadRequestException(
        'Provide either a rosterCode or a roster invite link',
      );
    }

    const referralToken = normalizeReferralToken(dto.referralToken);
    const org = await this.prisma.org.findFirst({
      where: rosterCode
        ? { rosterCode: rosterCode.toUpperCase() }
        : { rosterReferralToken: referralToken },
    });
    if (!org) {
      throw new NotFoundException(
        'No roster invite found for that code or link',
      );
    }

    const [existingRoster, existingGuild] = await Promise.all([
      this.prisma.membership.findFirst({ where: { userId } }),
      this.prisma.guildMembership.findFirst({ where: { userId } }),
    ]);

    if (existingRoster) {
      throw new ConflictException(
        existingRoster.orgId === org.id
          ? 'You are already on this roster'
          : 'You already belong to another org roster',
      );
    }
    if (existingGuild && existingGuild.orgId !== org.id) {
      throw new ConflictException('You already belong to another guild');
    }

    // Joiners never pick their own elevated role — always PLAYER.
    const role = MembershipRole.PLAYER;

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockOrgRoster(tx, org.id);
        const cap = ROLE_CAPS[role]!;
        const currentCount = await tx.membership.count({
          where: { orgId: org.id, role },
        });
        if (currentCount >= cap) {
          throw new ConflictException(
            `This org already has the maximum of ${cap} players`,
          );
        }

        await tx.membership.create({
          data: { userId, orgId: org.id, role },
        });
        if (!existingGuild) {
          await tx.guildMembership.create({
            data: { userId, orgId: org.id, role: GuildRole.MEMBER },
          });
        }
      });
    } catch (err) {
      this.rethrowAsConflictOnDuplicateMembership(err);
    }

    this.notifyMembersChanged(org.id);
    return this.toOrgResponse(org, role, false);
  }

  async getMyOrgWithMembers(userId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId },
      include: {
        org: {
          include: { memberships: { include: { user: true } } },
        },
      },
    });
    if (!membership) {
      throw new NotFoundException('You are not part of an org yet');
    }

    // Roster invites / codes are owner-only. Coaches manage day-to-day play;
    // joining still works via the code or invite link the owner shared.
    const canInviteRoster = membership.isOwner;

    return {
      id: membership.org.id,
      name: membership.org.name,
      orgCode: membership.org.orgCode,
      referralLink: referralLinkFor(membership.org.referralToken),
      rosterCode: canInviteRoster ? membership.org.rosterCode : null,
      // Distinct roster token — never the guild referralToken.
      rosterReferralLink: canInviteRoster
        ? referralLinkFor(membership.org.rosterReferralToken, {
            seat: 'roster',
            invitedByUserId: userId,
          })
        : null,
      canInviteRoster,
      myRole: membership.role,
      isOwner: membership.isOwner,
      historyVisibleToNewMembers: membership.org.historyVisibleToNewMembers,
      freeFireGuildId: membership.org.freeFireGuildId ?? null,
      members: membership.org.memberships.map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
        isOwner: m.isOwner,
        // Used by scoreboard OCR to match Free Fire IGNs (e.g. SES-SRI).
        inGameName: m.user.inGameName,
        // In-game role tags (IGL/Sniper/...), separate from the org role above.
        inGameRoles: m.user.roles,
      })),
    };
  }

  async updateHistorySetting(
    currentUserId: string,
    historyVisibleToNewMembers: boolean,
  ) {
    const current = await this.prisma.membership.findFirst({
      where: { userId: currentUserId },
    });
    if (!current) {
      throw new NotFoundException('You are not part of an org yet');
    }
    if (!current.isOwner) {
      throw new ForbiddenException(
        'Only the org owner can change this setting',
      );
    }

    await this.prisma.org.update({
      where: { id: current.orgId },
      data: { historyVisibleToNewMembers },
    });

    return { historyVisibleToNewMembers };
  }

  /** Owner sets / clears the Free Fire in-game guild ID shown on Guild. */
  async updateFreeFireGuildId(
    currentUserId: string,
    freeFireGuildId: string | null | undefined,
  ) {
    const current = await this.prisma.membership.findFirst({
      where: { userId: currentUserId },
    });
    if (!current) {
      throw new NotFoundException('You are not part of an org yet');
    }
    if (!current.isOwner) {
      throw new ForbiddenException(
        'Only the org owner can set the Free Fire guild ID',
      );
    }
    const next = normalizeFreeFireGuildId(freeFireGuildId);
    await this.prisma.org.update({
      where: { id: current.orgId },
      data: { freeFireGuildId: next },
    });
    return { freeFireGuildId: next };
  }

  async createAchievement(
    currentUserId: string,
    dto: CreateAchievementDto,
    pointsTable?: Express.Multer.File,
  ) {
    const current = await this.prisma.membership.findFirst({
      where: { userId: currentUserId },
    });
    if (!current) {
      throw new NotFoundException('You are not part of an org yet');
    }
    if (!current.isOwner) {
      throw new ForbiddenException(
        'Only the org owner can add guild achievements',
      );
    }
    let pointsTableFileKey: string | null = null;
    if (pointsTable) {
      if (!pointsTable.mimetype.startsWith('image/')) {
        throw new BadRequestException(
          'Points table must be an image (screenshot)',
        );
      }
      const stored = await this.storage.storeUploadedFile(pointsTable);
      pointsTableFileKey = stored.fileKey;
    }
    const playedAt = parseAchievementDate(dto.date);
    try {
      const row = await this.prisma.orgAchievement.create({
        data: {
          orgId: current.orgId,
          name: dto.name.trim(),
          playedAt,
          grandFinalLink: normalizeOptionalUrl(dto.grandFinalLink),
          standing: dto.standing.trim(),
          pointsTableFileKey,
        },
      });
      return this.serializeAchievement(row, currentUserId);
    } catch (err) {
      if (pointsTableFileKey) {
        await this.storage.deleteFile(pointsTableFileKey);
      }
      throw err;
    }
  }

  async deleteAchievement(currentUserId: string, achievementId: string) {
    const current = await this.prisma.membership.findFirst({
      where: { userId: currentUserId },
    });
    if (!current) {
      throw new NotFoundException('You are not part of an org yet');
    }
    if (!current.isOwner) {
      throw new ForbiddenException(
        'Only the org owner can remove guild achievements',
      );
    }
    const row = await this.prisma.orgAchievement.findFirst({
      where: { id: achievementId, orgId: current.orgId },
    });
    if (!row) {
      throw new NotFoundException('Achievement not found');
    }
    await this.prisma.orgAchievement.delete({ where: { id: row.id } });
    if (row.pointsTableFileKey) {
      await this.storage.deleteFile(row.pointsTableFileKey);
    }
    return { deleted: true };
  }

  private async serializeAchievement(
    row: {
      id: string;
      name: string;
      playedAt: Date;
      grandFinalLink: string | null;
      standing: string;
      pointsTableFileKey: string | null;
    },
    viewerId: string,
  ) {
    return {
      id: row.id,
      name: row.name,
      date: row.playedAt.toISOString().slice(0, 10),
      grandFinalLink: row.grandFinalLink,
      standing: row.standing,
      pointsTableUrl: await this.resolveAchievementImageUrl(
        row.pointsTableFileKey,
        viewerId,
      ),
    };
  }

  private async resolveAchievementImageUrl(
    fileKey: string | null | undefined,
    viewerId: string,
  ): Promise<string | null> {
    if (!fileKey) return null;
    const cloud = this.storage.buildDeliveryUrl(fileKey);
    if (cloud) return cloud;
    const token = await this.jwtService.signAsync(
      { sub: viewerId, fileKey, purpose: 'media-file' },
      { expiresIn: '7d' },
    );
    return `/media/files/${encodeURIComponent(fileKey)}?token=${token}`;
  }

  async changeMemberRole(currentUserId: string, dto: UpdateMemberRoleDto) {
    const current = await this.prisma.membership.findFirst({
      where: { userId: currentUserId },
    });
    if (!current) {
      throw new NotFoundException('You are not part of an org yet');
    }
    if (!current.isOwner) {
      throw new ForbiddenException(
        'Only the org owner can change member roles',
      );
    }

    const target = await this.prisma.membership.findFirst({
      where: { userId: dto.targetUserId, orgId: current.orgId },
    });
    if (!target) {
      throw new NotFoundException('That user is not a member of your org');
    }
    if (target.role === dto.role) {
      return { userId: target.userId, role: target.role };
    }

    await this.prisma.$transaction(async (tx) => {
      await this.lockOrgRoster(tx, current.orgId);
      const cap = ROLE_CAPS[dto.role];
      if (cap !== undefined) {
        const currentCount = await tx.membership.count({
          where: {
            orgId: current.orgId,
            role: dto.role,
            // Don't count the target against the new role's cap — they're
            // leaving their old seat.
            userId: { not: target.userId },
          },
        });
        if (currentCount >= cap) {
          throw new ConflictException(
            `This org already has the maximum of ${cap} ${dto.role.toLowerCase()}(s)`,
          );
        }
      }

      await tx.membership.update({
        where: { id: target.id },
        data: { role: dto.role },
      });
    });

    this.notifyMembersChanged(current.orgId);
    return {
      userId: target.userId,
      role: dto.role,
    };
  }

  async transferOwnership(currentUserId: string, dto: TransferOwnershipDto) {
    const current = await this.prisma.membership.findFirst({
      where: { userId: currentUserId },
    });
    if (!current) {
      throw new NotFoundException('You are not part of an org yet');
    }
    if (!current.isOwner) {
      throw new ForbiddenException(
        'Only the current owner can transfer ownership',
      );
    }
    if (current.userId === dto.targetUserId) {
      throw new BadRequestException('You already own this org');
    }

    const target = await this.prisma.membership.findFirst({
      where: { userId: dto.targetUserId, orgId: current.orgId },
    });
    if (!target) {
      throw new NotFoundException('That user is not a member of your org');
    }

    await this.prisma.$transaction([
      this.prisma.membership.update({
        where: { id: current.id },
        data: { isOwner: false },
      }),
      this.prisma.membership.update({
        where: { id: target.id },
        data: { isOwner: true },
      }),
    ]);
    this.notifyMembersChanged(current.orgId);
  }

  async removeMember(currentUserId: string, dto: RemoveMemberDto) {
    const current = await this.prisma.membership.findFirst({
      where: { userId: currentUserId },
    });
    if (!current) {
      throw new NotFoundException('You are not part of an org yet');
    }
    // Owner-only — a coach can promote/demote functional roles but cannot
    // remove a member from the org.
    if (!current.isOwner) {
      throw new ForbiddenException('Only the org owner can remove members');
    }
    if (current.userId === dto.targetUserId) {
      throw new BadRequestException(
        'You cannot remove yourself — transfer ownership first',
      );
    }

    const target = await this.prisma.membership.findFirst({
      where: { userId: dto.targetUserId, orgId: current.orgId },
    });
    if (!target) {
      throw new NotFoundException('That user is not a member of your org');
    }
    if (target.isOwner) {
      throw new ForbiddenException('The org owner cannot be removed');
    }

    // No soft-delete concept anywhere in this schema — a hard delete here
    // stays consistent with that. Chat/scrim/stat history referencing this
    // user stays intact (those rows key off User.id, not Membership).
    await this.prisma.membership.delete({ where: { id: target.id } });
    this.notifyMembersChanged(current.orgId);
    this.notifyMembershipChanged(dto.targetUserId, current.orgId);
  }

  /**
   * Discoverable guilds for someone who is not in one yet — searchable by name,
   * with basic counts so Join can show a list instead of only a code box.
   */
  async browseGuilds(userId: string, q?: string) {
    const [guild, roster] = await Promise.all([
      this.prisma.guildMembership.findFirst({ where: { userId } }),
      this.prisma.membership.findFirst({ where: { userId } }),
    ]);
    if (guild || roster) {
      throw new ConflictException(
        'Leave your current guild before browsing others',
      );
    }

    const query = q?.trim();
    const orgs = await this.prisma.org.findMany({
      where: query
        ? { name: { contains: query, mode: 'insensitive' } }
        : undefined,
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: {
          select: { guildMemberships: true, memberships: true },
        },
        // The guild chat's group photo doubles as the org's logo — set at
        // create time (or later from Guild Chat settings).
        chatChannelMetas: {
          where: { channelKey: GUILD_CHANNEL_KEY },
          select: { avatarUrl: true, avatarFileKey: true },
          take: 1,
        },
      },
      orderBy: [{ guildMemberships: { _count: 'desc' } }, { name: 'asc' }],
      take: 50,
    });

    // Which of these the user has already asked to join, so the list can show
    // "Requested" instead of offering the button again.
    const requests = await this.prisma.guildJoinRequest.findMany({
      where: { userId, orgId: { in: orgs.map((o) => o.id) } },
      select: { orgId: true, status: true },
    });
    const statusByOrg = new Map(requests.map((r) => [r.orgId, r.status]));

    return {
      guilds: orgs.map((o) => {
        const meta = o.chatChannelMetas[0];
        // Prefer a fresh Cloudinary delivery URL so browse (no membership)
        // still loads the logo. Fall back to the stored avatarUrl.
        const fromKey = meta?.avatarFileKey
          ? this.storage.buildDeliveryUrl(meta.avatarFileKey)
          : null;
        return {
          id: o.id,
          name: o.name,
          logoUrl: fromKey ?? meta?.avatarUrl ?? null,
          memberCount: o._count.guildMemberships,
          rosterCount: o._count.memberships,
          createdAt: o.createdAt.toISOString(),
          requestStatus: statusByOrg.get(o.id) ?? null,
        };
      }),
    };
  }

  /**
   * Leave the current guild. Also drops the esports roster seat for that org.
   * Org owners must transfer ownership first.
   */
  async leaveGuild(userId: string) {
    const guild = await this.prisma.guildMembership.findFirst({
      where: { userId },
      include: { org: { select: { id: true, name: true } } },
    });
    if (!guild) {
      throw new NotFoundException('You are not part of a guild');
    }

    const roster = await this.prisma.membership.findFirst({
      where: { userId, orgId: guild.orgId },
    });
    if (roster?.isOwner) {
      throw new ForbiddenException(
        'Transfer ownership before leaving — you own this org’s roster',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      if (roster) {
        await tx.membership.delete({ where: { id: roster.id } });
      }
      await tx.guildMembership.delete({ where: { id: guild.id } });
    });
    this.notifyMembersChanged(guild.orgId);
    return { left: true, orgId: guild.org.id, name: guild.org.name };
  }

  // ── Guild join requests ────────────────────────────────────────────────
  // Browsing the public list and tapping "Join" used to drop the person
  // straight into the guild. Now it asks: the owner (and guild leadership)
  // decide. Having the org code or a personal invite link still joins
  // directly — the code IS the owner's permission.

  /** Everyone who should see this org's join-request inbox. */
  private async assertCanDecideJoinRequests(userId: string, orgId: string) {
    const [roster, guild] = await Promise.all([
      this.prisma.membership.findFirst({
        where: { userId, orgId },
        select: { isOwner: true, role: true },
      }),
      this.prisma.guildMembership.findFirst({
        where: { userId, orgId },
        select: { role: true },
      }),
    ]);
    const allowed =
      roster?.isOwner ||
      roster?.role === MembershipRole.COACH ||
      guild?.role === GuildRole.LEADER ||
      guild?.role === GuildRole.ACTIVE_LEADER;
    if (!allowed) {
      throw new ForbiddenException(
        'Only the owner or guild leadership can review join requests',
      );
    }
  }

  private async notifyJoinRequestReceived(
    orgId: string,
    orgName: string,
    requesterName: string,
  ) {
    const [owners, leaders] = await Promise.all([
      this.prisma.membership.findMany({
        where: {
          orgId,
          OR: [{ isOwner: true }, { role: MembershipRole.COACH }],
        },
        select: { user: { select: { id: true, expoPushToken: true } } },
      }),
      this.prisma.guildMembership.findMany({
        where: {
          orgId,
          role: { in: [GuildRole.LEADER, GuildRole.ACTIVE_LEADER] },
        },
        select: { user: { select: { id: true, expoPushToken: true } } },
      }),
    ]);
    const byId = new Map(
      [...owners, ...leaders].map((m) => [m.user.id, m.user.expoPushToken]),
    );

    const messages: PushMessage[] = [];
    for (const [id, token] of byId) {
      for (const to of this.pushNotifications.tokensFor(token)) {
        messages.push({
          to,
          title: 'New guild join request',
          body: `${requesterName} wants to join ${orgName}.`,
          data: { type: 'guild_join_request', orgId },
          // Several requests shouldn't stack up a tray full of near-identical
          // lines — one entry that keeps updating.
          collapseId: `guild-join-request:${orgId}:${id}`,
          channelId: 'default',
          priority: 'high',
        });
      }
    }
    await this.pushNotifications.send(messages);
  }

  private async notifyJoinRequestDecided(
    userId: string,
    orgName: string,
    accepted: boolean,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { expoPushToken: true },
    });
    const messages: PushMessage[] = this.pushNotifications
      .tokensFor(user?.expoPushToken)
      .map((to) => ({
        to,
        title: accepted ? `You're in — ${orgName}` : `${orgName} declined`,
        body: accepted
          ? 'Your guild join request was accepted. Tap to open the app.'
          : 'Your guild join request was not accepted. You can try another guild.',
        data: { type: 'guild_join_decision', accepted },
        collapseId: `guild-join-decision:${userId}`,
        channelId: 'default',
        priority: 'high',
      }));
    await this.pushNotifications.send(messages);
  }

  /** Ask an org's leadership to let you into their guild. */
  async requestGuildJoin(userId: string, orgId: string) {
    const [guild, roster, org, user] = await Promise.all([
      this.prisma.guildMembership.findFirst({ where: { userId } }),
      this.prisma.membership.findFirst({ where: { userId } }),
      this.prisma.org.findUnique({
        where: { id: orgId },
        select: { id: true, name: true },
      }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { name: true, inGameName: true },
      }),
    ]);
    if (!org) throw new NotFoundException('No guild found');
    if (guild || roster) {
      throw new ConflictException(
        'Leave your current guild before requesting another',
      );
    }

    const existing = await this.prisma.guildJoinRequest.findUnique({
      where: { userId_orgId: { userId, orgId } },
      select: { id: true, status: true },
    });
    if (existing?.status === GuildJoinRequestStatus.PENDING) {
      // Re-tapping is not an error — just report where it stands.
      return { status: existing.status, orgId, orgName: org.name };
    }

    // A previous rejection is reopened rather than stacking a second row, so
    // the inbox never shows the same person twice.
    await this.prisma.guildJoinRequest.upsert({
      where: { userId_orgId: { userId, orgId } },
      create: { userId, orgId, status: GuildJoinRequestStatus.PENDING },
      update: {
        status: GuildJoinRequestStatus.PENDING,
        decidedAt: null,
        decidedById: null,
      },
    });
    this.realtime.publish(orgId, 'members.changed');
    await this.notifyJoinRequestReceived(
      orgId,
      org.name,
      user.inGameName ?? user.name,
    );
    return {
      status: GuildJoinRequestStatus.PENDING,
      orgId,
      orgName: org.name,
    };
  }

  /** The requester's own view — drives the browse list's "Requested" chips. */
  async myGuildJoinRequests(userId: string) {
    const rows = await this.prisma.guildJoinRequest.findMany({
      where: { userId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        org: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      requests: rows.map((r) => ({
        id: r.id,
        orgId: r.org.id,
        orgName: r.org.name,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  /** Withdraw your own pending request. */
  async cancelGuildJoinRequest(userId: string, requestId: string) {
    const request = await this.prisma.guildJoinRequest.findUnique({
      where: { id: requestId },
      select: { id: true, userId: true, orgId: true, status: true },
    });
    if (!request || request.userId !== userId) {
      throw new NotFoundException('Request not found');
    }
    if (request.status !== GuildJoinRequestStatus.PENDING) {
      throw new BadRequestException('That request is no longer pending');
    }
    await this.prisma.guildJoinRequest.delete({ where: { id: requestId } });
    this.realtime.publish(request.orgId, 'members.changed');
    return { cancelled: true };
  }

  /** Pending requests for the caller's own org. */
  async listGuildJoinRequests(userId: string) {
    const guild = await this.prisma.guildMembership.findFirst({
      where: { userId },
      select: { orgId: true },
    });
    const roster = await this.prisma.membership.findFirst({
      where: { userId },
      select: { orgId: true },
    });
    const orgId = guild?.orgId ?? roster?.orgId;
    if (!orgId) throw new NotFoundException('You are not part of a guild yet');
    await this.assertCanDecideJoinRequests(userId, orgId);

    const rows = await this.prisma.guildJoinRequest.findMany({
      where: { orgId, status: GuildJoinRequestStatus.PENDING },
      select: {
        id: true,
        createdAt: true,
        user: {
          select: { id: true, name: true, inGameName: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return {
      requests: rows.map((r) => ({
        id: r.id,
        userId: r.user.id,
        name: r.user.name,
        inGameName: r.user.inGameName,
        avatarUrl: r.user.avatarUrl,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  /** Accept or reject one request. Accepting creates the guild seat. */
  async decideGuildJoinRequest(
    userId: string,
    requestId: string,
    accept: boolean,
  ) {
    const request = await this.prisma.guildJoinRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        userId: true,
        orgId: true,
        status: true,
        org: { select: { name: true } },
      },
    });
    if (!request) throw new NotFoundException('Request not found');
    await this.assertCanDecideJoinRequests(userId, request.orgId);
    if (request.status !== GuildJoinRequestStatus.PENDING) {
      throw new BadRequestException('That request was already decided');
    }

    if (!accept) {
      await this.prisma.guildJoinRequest.update({
        where: { id: requestId },
        data: {
          status: GuildJoinRequestStatus.REJECTED,
          decidedAt: new Date(),
          decidedById: userId,
        },
      });
      this.realtime.publish(request.orgId, 'members.changed');
      this.notifyMembershipChanged(request.userId, request.orgId);
      await this.notifyJoinRequestDecided(
        request.userId,
        request.org.name,
        false,
      );
      return { status: GuildJoinRequestStatus.REJECTED };
    }

    // Someone else may have let them in (code, invite link, another guild)
    // between the request and this tap.
    const alreadySeated = await this.prisma.guildMembership.findFirst({
      where: { userId: request.userId },
      select: { orgId: true },
    });
    if (alreadySeated) {
      await this.prisma.guildJoinRequest.update({
        where: { id: requestId },
        data: {
          status:
            alreadySeated.orgId === request.orgId
              ? GuildJoinRequestStatus.ACCEPTED
              : GuildJoinRequestStatus.SUPERSEDED,
          decidedAt: new Date(),
          decidedById: userId,
        },
      });
      this.realtime.publish(request.orgId, 'members.changed');
      throw new ConflictException(
        alreadySeated.orgId === request.orgId
          ? 'They are already in your guild'
          : 'They already joined another guild',
      );
    }

    // Seat + decision + withdrawal of their other asks in one transaction, so
    // a half-applied accept can never leave them seated with live requests
    // still sitting in other owners' inboxes.
    await this.prisma.$transaction([
      this.prisma.guildMembership.create({
        data: {
          userId: request.userId,
          orgId: request.orgId,
          role: GuildRole.MEMBER,
        },
      }),
      this.prisma.guildJoinRequest.update({
        where: { id: requestId },
        data: {
          status: GuildJoinRequestStatus.ACCEPTED,
          decidedAt: new Date(),
          decidedById: userId,
        },
      }),
      this.prisma.guildJoinRequest.updateMany({
        where: {
          userId: request.userId,
          status: GuildJoinRequestStatus.PENDING,
          orgId: { not: request.orgId },
        },
        data: {
          status: GuildJoinRequestStatus.SUPERSEDED,
          decidedAt: new Date(),
        },
      }),
    ]);

    this.notifyMembersChanged(request.orgId);
    this.notifyMembershipChanged(request.userId, request.orgId);
    await this.notifyJoinRequestDecided(request.userId, request.org.name, true);
    return { status: GuildJoinRequestStatus.ACCEPTED, orgId: request.orgId };
  }

  /**
   * Guild code / invite-link / browse-list join. Creates a guild seat only — the
   * esports roster stays unchanged until an owner or coach adds this person.
   * Optional invitedByUserId attributes the seat to a referrer.
   */
  async joinGuild(userId: string, dto: JoinOrgDto) {
    if (!dto.orgCode && !dto.referralToken) {
      // An orgId alone is just "I saw you in the public list" — that is a
      // request for the owner to approve (requestGuildJoin), not a join.
      // A code or invite link is the owner's permission, so those go through.
      throw new BadRequestException(
        dto.orgId
          ? 'Joining from the guild list needs the owner’s approval — send a request, or use the guild code / invite link.'
          : 'Provide an orgCode or referralToken',
      );
    }

    const referralToken = normalizeReferralToken(dto.referralToken);
    const org = await this.prisma.org.findFirst({
      where: dto.orgCode
        ? { orgCode: dto.orgCode.toUpperCase() }
        : { referralToken },
    });
    if (!org) {
      throw new NotFoundException('No org found for that code or link');
    }

    const [guild, roster] = await Promise.all([
      this.prisma.guildMembership.findFirst({ where: { userId } }),
      this.prisma.membership.findFirst({ where: { userId } }),
    ]);

    if (guild && guild.orgId !== org.id) {
      throw new ConflictException('You already belong to a guild');
    }
    if (roster && roster.orgId !== org.id) {
      throw new ConflictException('You already belong to another org roster');
    }
    if (guild) {
      return { id: org.id, name: org.name, role: guild.role };
    }

    const invitedByUserId = await this.resolveInviter(
      org.id,
      dto.invitedByUserId || extractInviteRef(dto.referralToken),
      userId,
    );

    try {
      const created = await this.prisma.guildMembership.create({
        data: {
          userId,
          orgId: org.id,
          role: GuildRole.MEMBER,
          invitedByUserId,
        },
      });
      // They got in with a code while other owners still had their request
      // sitting in an inbox — drop those so nobody accepts a seat that is
      // already taken.
      await this.prisma.guildJoinRequest.updateMany({
        where: { userId, status: GuildJoinRequestStatus.PENDING },
        data: {
          status: GuildJoinRequestStatus.SUPERSEDED,
          decidedAt: new Date(),
        },
      });
      this.notifyMembersChanged(org.id);
      this.notifyMembershipChanged(userId, org.id);
      return { id: org.id, name: org.name, role: created.role };
    } catch (err) {
      this.rethrowAsConflictOnDuplicateMembership(err);
    }
  }

  /** Inviter must already belong to this org (guild and/or roster). */
  private async resolveInviter(
    orgId: string,
    candidateId: string | undefined,
    joiningUserId: string,
  ): Promise<string | undefined> {
    if (!candidateId || candidateId === joiningUserId) return undefined;
    const [guildSeat, rosterSeat] = await Promise.all([
      this.prisma.guildMembership.findFirst({
        where: { userId: candidateId, orgId },
        select: { userId: true },
      }),
      this.prisma.membership.findFirst({
        where: { userId: candidateId, orgId },
        select: { userId: true },
      }),
    ]);
    return guildSeat || rosterSeat ? candidateId : undefined;
  }

  async getMyGuild(userId: string) {
    const roster = await this.prisma.membership.findFirst({
      where: { userId },
    });
    let guild = await this.prisma.guildMembership.findFirst({
      where: { userId },
      include: { org: true },
    });

    if (!guild && roster) {
      guild = await this.prisma.guildMembership.create({
        data: {
          userId,
          orgId: roster.orgId,
          role: roster.isOwner ? GuildRole.LEADER : GuildRole.MEMBER,
        },
        include: { org: true },
      });
    }
    if (!guild) {
      throw new NotFoundException('You are not part of a guild yet');
    }
    if (roster && roster.orgId !== guild.orgId) {
      throw new ConflictException(
        'Your guild and roster are in different orgs',
      );
    }

    const orgId = guild.orgId;
    const [rosterMembers, guildMembers, achievements] = await Promise.all([
      this.prisma.membership.findMany({
        where: { orgId },
        include: {
          user: {
            select: { id: true, name: true, email: true, inGameName: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.guildMembership.findMany({
        where: { orgId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
              inGameName: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.orgAchievement.findMany({
        where: { orgId },
        orderBy: [{ playedAt: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    const rosterByUser = new Map(rosterMembers.map((m) => [m.userId, m]));
    // Add/remove roster seats from Guild is owner-only (same as roster invites).
    const canManage = !!roster && roster.isOwner;
    const leadership =
      guild.role === GuildRole.LEADER ||
      guild.role === GuildRole.ELDER ||
      guild.role === GuildRole.ACTIVE_LEADER;

    // Code is for managers/leadership; every guild member gets a personal
    // referral link (`?ref=`) so invite totals can be attributed.
    const canShareCode = canManage || leadership;
    const myInviteCount = await this.prisma.guildMembership.count({
      where: { orgId, invitedByUserId: userId },
    });

    return {
      id: guild.org.id,
      name: guild.org.name,
      orgCode: canShareCode ? guild.org.orgCode : null,
      freeFireGuildId: guild.org.freeFireGuildId ?? null,
      referralLink: referralLinkFor(guild.org.referralToken, {
        invitedByUserId: userId,
      }),
      myInviteCount,
      myGuildRole: guild.role,
      onRoster: !!roster,
      canManageRoster: canManage,
      achievements: await Promise.all(
        achievements.map((a) => this.serializeAchievement(a, userId)),
      ),
      roster: rosterMembers.map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        inGameName: m.user.inGameName,
        role: m.role,
        isOwner: m.isOwner,
      })),
      members: guildMembers.map((m) => {
        const seat = rosterByUser.get(m.userId);
        return {
          userId: m.user.id,
          name: m.user.name,
          email: m.user.email,
          avatarUrl: m.user.avatarUrl,
          inGameName: m.user.inGameName,
          guildRole: m.role,
          onRoster: !!seat,
          rosterRole: seat?.role ?? null,
          isOwner: seat?.isOwner ?? false,
        };
      }),
    };
  }

  async addGuildMemberToRoster(currentUserId: string, dto: AddRosterMemberDto) {
    const actor = await this.assertRosterManager(currentUserId);
    const guildSeat = await this.prisma.guildMembership.findFirst({
      where: { userId: dto.targetUserId, orgId: actor.orgId },
    });
    if (!guildSeat) {
      throw new NotFoundException('That person is not in your guild');
    }

    const existing = await this.prisma.membership.findFirst({
      where: { userId: dto.targetUserId, orgId: actor.orgId },
    });
    if (existing) {
      throw new ConflictException('That person is already on the roster');
    }

    const otherOrg = await this.prisma.membership.findFirst({
      where: { userId: dto.targetUserId, orgId: { not: actor.orgId } },
    });
    if (otherOrg) {
      throw new ConflictException('That person is already on another roster');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockOrgRoster(tx, actor.orgId);
        const cap = ROLE_CAPS[dto.role];
        if (cap !== undefined) {
          const currentCount = await tx.membership.count({
            where: { orgId: actor.orgId, role: dto.role },
          });
          if (currentCount >= cap) {
            throw new ConflictException(
              `This roster already has the maximum of ${cap} ${dto.role.toLowerCase()}(s)`,
            );
          }
        }

        await tx.membership.create({
          data: {
            userId: dto.targetUserId,
            orgId: actor.orgId,
            role: dto.role,
          },
        });
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('That person is already on a roster');
      }
      throw err;
    }

    this.notifyMembersChanged(actor.orgId);
    // The new roster member moves guild → main stack; they only ever found
    // out on a restart before this.
    this.notifyMembershipChanged(dto.targetUserId, actor.orgId);
    return { userId: dto.targetUserId, role: dto.role };
  }

  async removeFromRoster(currentUserId: string, dto: RemoveMemberDto) {
    const actor = await this.assertRosterManager(currentUserId);
    if (actor.userId === dto.targetUserId) {
      throw new BadRequestException(
        'You cannot remove yourself from the roster',
      );
    }

    const target = await this.prisma.membership.findFirst({
      where: { userId: dto.targetUserId, orgId: actor.orgId },
    });
    if (!target) {
      throw new NotFoundException('That person is not on the roster');
    }
    if (target.isOwner) {
      throw new ForbiddenException(
        'Transfer ownership before removing the owner',
      );
    }

    await this.prisma.membership.delete({ where: { id: target.id } });
    this.notifyMembersChanged(actor.orgId);
    this.notifyMembershipChanged(dto.targetUserId, actor.orgId);
    return { success: true };
  }

  // Every ROLE_CAPS check below is a count-then-insert inside a single
  // $transaction — Postgres's default READ COMMITTED isolation does NOT
  // stop two concurrent transactions from both reading the same
  // under-the-cap count and both committing, exceeding it (e.g. a 6th
  // PLAYER squeezing in via two simultaneous joinOrg calls). A transaction-
  // scoped advisory lock keyed by orgId serializes every roster-modifying
  // transaction for the SAME org (released automatically at commit/
  // rollback) without needing SERIALIZABLE isolation + retry logic, and
  // without blocking unrelated orgs against each other.
  private async lockOrgRoster(tx: Prisma.TransactionClient, orgId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orgId}), 0)`;
  }

  private async assertRosterManager(userId: string) {
    const roster = await this.prisma.membership.findFirst({
      where: { userId },
    });
    if (!roster?.isOwner) {
      throw new ForbiddenException(
        'Only the org owner can change the roster',
      );
    }
    return roster;
  }

  private async assertUserHasNoOrg(userId: string) {
    const [existing, guild] = await Promise.all([
      this.prisma.membership.findFirst({ where: { userId } }),
      this.prisma.guildMembership.findFirst({ where: { userId } }),
    ]);
    if (existing || guild) {
      throw new ConflictException(
        'You already belong to an org — leave it before creating or joining another',
      );
    }
  }

  // assertUserHasNoOrg (and joinGuild's equivalent check) are check-then-act,
  // not atomic — Membership/GuildMembership's @@unique([userId]) is the real
  // guarantee against two concurrent requests both slipping past that check
  // into two different orgs. Convert the resulting P2002 into the same clean
  // 409 assertUserHasNoOrg would have given, instead of a raw 500.
  private rethrowAsConflictOnDuplicateMembership(err: unknown): never {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictException(
        'You already belong to an org — leave it before creating or joining another',
      );
    }
    throw err;
  }

  private toOrgResponse(
    org: {
      id: string;
      name: string;
      orgCode: string;
      referralToken: string;
      rosterCode?: string;
      rosterReferralToken?: string;
    },
    role: MembershipRole | null,
    isOwner: boolean,
  ) {
    return {
      id: org.id,
      name: org.name,
      orgCode: org.orgCode,
      referralLink: referralLinkFor(org.referralToken),
      rosterCode: org.rosterCode ?? null,
      rosterReferralLink: org.rosterReferralToken
        ? referralLinkFor(org.rosterReferralToken, { seat: 'roster' })
        : null,
      myRole: role,
      isOwner,
    };
  }
}

/** Blank / whitespace → null; otherwise trimmed digits string. */
function normalizeFreeFireGuildId(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalUrl(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Parse YYYY-MM-DD into a UTC midnight Date; reject impossible calendar days. */
function parseAchievementDate(isoDate: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) {
    throw new BadRequestException('Date must be YYYY-MM-DD');
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== mo - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new BadRequestException('Invalid date');
  }
  return dt;
}

