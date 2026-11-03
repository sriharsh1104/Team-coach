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
const generateOrgCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);
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

function referralLinkFor(token: string) {
  const base = (process.env.WEB_PUBLIC_URL || 'http://localhost:5173').replace(
    /\/$/,
    '',
  );
  return `${base}/join/${token}`;
}

@Injectable()
export class OrgService {
  constructor(private readonly prisma: PrismaService) {}

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
        if (fields.includes('orgCode')) {
          throw new ConflictException(
            'Could not allocate a unique org code — please try again',
          );
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

  async joinOrg(userId: string, dto: JoinOrgDto) {
    if (!dto.orgCode && !dto.referralToken) {
      throw new BadRequestException(
        'Provide either an orgCode or a referralToken',
      );
    }

    await this.assertUserHasNoOrg(userId);

    const referralToken = normalizeReferralToken(dto.referralToken);
    const org = await this.prisma.org.findFirst({
      where: dto.orgCode
        ? { orgCode: dto.orgCode.toUpperCase() }
        : { referralToken },
    });
    if (!org) {
      throw new NotFoundException('No org found for that code or link');
    }

    // Joiners never pick their own elevated role — always PLAYER. The
    // owner promotes to COACH / ANALYST from the roster afterwards.
    const role = MembershipRole.PLAYER;

    await this.prisma.$transaction(async (tx) => {
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
      await tx.guildMembership.create({
        data: { userId, orgId: org.id, role: GuildRole.MEMBER },
      });
    });

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

    return {
      id: membership.org.id,
      name: membership.org.name,
      orgCode: membership.org.orgCode,
      referralLink: referralLinkFor(membership.org.referralToken),
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
  }

  /**
   * Guild code join. Creates a guild seat only — the esports roster stays
   * unchanged until an owner or coach adds this person from the guild list.
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

    const created = await this.prisma.guildMembership.create({
      data: { userId, orgId: org.id, role: GuildRole.MEMBER },
    });
    return { id: org.id, name: org.name, role: created.role };
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

    const canShareInvite = canManage || leadership;

    return {
      id: guild.org.id,
      name: guild.org.name,
      orgCode: canShareInvite ? guild.org.orgCode : null,
      referralLink: canShareInvite
        ? referralLinkFor(guild.org.referralToken)
        : null,
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

    await this.prisma.$transaction(async (tx) => {
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
    return { success: true };
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

  private toOrgResponse(
    org: { id: string; name: string; orgCode: string; referralToken: string },
    role: MembershipRole | null,
    isOwner: boolean,
  ) {
    return {
      id: org.id,
      name: org.name,
      orgCode: org.orgCode,
      referralLink: referralLinkFor(org.referralToken),
      myRole: role,
      isOwner,
    };
  }
}
