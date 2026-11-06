import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { customAlphabet } from 'nanoid';
import { GuildRole, MembershipRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CreateOrgDto } from './dto/create-org.dto';
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
    if (trimmed.includes('://') || trimmed.startsWith('/join/') || trimmed.includes('?')) {
      const url = trimmed.includes('://')
        ? new URL(trimmed)
        : new URL(
            trimmed.startsWith('/') ? trimmed : `/?${trimmed.replace(/^\?/, '')}`,
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
  ) {}

  private notifyMembersChanged(orgId: string) {
    this.realtime.publish(orgId, 'members.changed');
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

    try {
      const org = await this.prisma.$transaction(async (tx) => {
        const createdOrg = await tx.org.create({
          data: {
            name,
            orgCode: generateOrgCode(),
            referralToken: generateReferralToken(),
            rosterCode: generateOrgCode(),
            rosterReferralToken: generateReferralToken(),
          },
        });

        await tx.membership.create({
          data: {
            userId,
            orgId: createdOrg.id,
            role: dto.role ?? null,
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
      throw new ForbiddenException('Only the owner can choose their roster role');
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
      throw new NotFoundException('No roster invite found for that code or link');
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

    const canInviteRoster =
      membership.isOwner || membership.role === MembershipRole.COACH;

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
      members: membership.org.memberships.map((m) => ({
        userId: m.user.id,
        name: m.user.name,
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

  async updateHistorySetting(currentUserId: string, historyVisibleToNewMembers: boolean) {
    const current = await this.prisma.membership.findFirst({
      where: { userId: currentUserId },
    });
    if (!current) {
      throw new NotFoundException('You are not part of an org yet');
    }
    if (!current.isOwner) {
      throw new ForbiddenException('Only the org owner can change this setting');
    }

    await this.prisma.org.update({
      where: { id: current.orgId },
      data: { historyVisibleToNewMembers },
    });

    return { historyVisibleToNewMembers };
  }

  async changeMemberRole(currentUserId: string, dto: UpdateMemberRoleDto) {
    const current = await this.prisma.membership.findFirst({
      where: { userId: currentUserId },
    });
    if (!current) {
      throw new NotFoundException('You are not part of an org yet');
    }
    if (!current.isOwner) {
      throw new ForbiddenException('Only the org owner can change member roles');
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
      throw new ForbiddenException('Only the current owner can transfer ownership');
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

    // No soft-delete concept anywhere in this schema — a hard delete here
    // stays consistent with that. Chat/scrim/stat history referencing this
    // user stays intact (those rows key off User.id, not Membership).
    await this.prisma.membership.delete({ where: { id: target.id } });
    this.notifyMembersChanged(current.orgId);
  }

  /**
   * Guild code / invite-link join. Creates a guild seat only — the esports
   * roster stays unchanged until an owner or coach adds this person from the
   * guild list. Optional invitedByUserId attributes the seat to a referrer.
   */
  async joinGuild(userId: string, dto: JoinOrgDto) {
    if (!dto.orgCode && !dto.referralToken) {
      throw new BadRequestException(
        'Provide either an orgCode or a referralToken',
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
      this.notifyMembersChanged(org.id);
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
      throw new ConflictException('Your guild and roster are in different orgs');
    }

    const orgId = guild.orgId;
    const [rosterMembers, guildMembers] = await Promise.all([
      this.prisma.membership.findMany({
        where: { orgId },
        include: {
          user: { select: { id: true, name: true, inGameName: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.guildMembership.findMany({
        where: { orgId },
        include: {
          user: { select: { id: true, name: true, inGameName: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const rosterByUser = new Map(rosterMembers.map((m) => [m.userId, m]));
    const canManage = !!roster && (roster.isOwner || roster.role === MembershipRole.COACH);
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
      referralLink: referralLinkFor(guild.org.referralToken, {
        invitedByUserId: userId,
      }),
      myInviteCount,
      myGuildRole: guild.role,
      onRoster: !!roster,
      canManageRoster: canManage,
      roster: rosterMembers.map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        inGameName: m.user.inGameName,
        role: m.role,
        isOwner: m.isOwner,
      })),
      members: guildMembers.map((m) => {
        const seat = rosterByUser.get(m.userId);
        return {
          userId: m.user.id,
          name: m.user.name,
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
    return { userId: dto.targetUserId, role: dto.role };
  }

  async removeFromRoster(currentUserId: string, dto: RemoveMemberDto) {
    const actor = await this.assertRosterManager(currentUserId);
    if (actor.userId === dto.targetUserId) {
      throw new BadRequestException('You cannot remove yourself from the roster');
    }

    const target = await this.prisma.membership.findFirst({
      where: { userId: dto.targetUserId, orgId: actor.orgId },
    });
    if (!target) {
      throw new NotFoundException('That person is not on the roster');
    }
    if (target.isOwner) {
      throw new ForbiddenException('Transfer ownership before removing the owner');
    }

    await this.prisma.membership.delete({ where: { id: target.id } });
    this.notifyMembersChanged(actor.orgId);
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
    if (!roster || (!roster.isOwner && roster.role !== MembershipRole.COACH)) {
      throw new ForbiddenException(
        'Only the roster owner or a coach can change the roster',
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
