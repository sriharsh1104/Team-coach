import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { customAlphabet } from 'nanoid';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrgDto } from './dto/create-org.dto';
import { JoinOrgDto } from './dto/join-org.dto';

const MAX_PLAYERS_PER_ORG = 5;

// Unambiguous uppercase alphabet (no 0/O/1/I) for a code players type by hand.
const generateOrgCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);
const generateReferralToken = customAlphabet(
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  24,
);

@Injectable()
export class OrgService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrg(userId: string, dto: CreateOrgDto) {
    await this.assertUserHasNoOrg(userId);

    const org = await this.prisma.$transaction(async (tx) => {
      const createdOrg = await tx.org.create({
        data: {
          name: dto.name,
          orgCode: generateOrgCode(),
          referralToken: generateReferralToken(),
        },
      });

      await tx.membership.create({
        data: { userId, orgId: createdOrg.id, role: dto.role },
      });

      return createdOrg;
    });

    return this.toOrgResponse(org, dto.role);
  }

  async joinOrg(userId: string, dto: JoinOrgDto) {
    if (!dto.orgCode && !dto.referralToken) {
      throw new BadRequestException(
        'Provide either an orgCode or a referralToken',
      );
    }

    await this.assertUserHasNoOrg(userId);

    const org = await this.prisma.org.findFirst({
      where: dto.orgCode
        ? { orgCode: dto.orgCode.toUpperCase() }
        : { referralToken: dto.referralToken },
    });
    if (!org) {
      throw new NotFoundException('No org found for that code or link');
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.role === MembershipRole.PLAYER) {
        const playerCount = await tx.membership.count({
          where: { orgId: org.id, role: MembershipRole.PLAYER },
        });
        if (playerCount >= MAX_PLAYERS_PER_ORG) {
          throw new ConflictException(
            `This org already has the maximum of ${MAX_PLAYERS_PER_ORG} players`,
          );
        }
      }

      await tx.membership.create({
        data: { userId, orgId: org.id, role: dto.role },
      });
    });

    return this.toOrgResponse(org, dto.role);
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
      referralLink: membership.org.referralToken,
      myRole: membership.role,
      members: membership.org.memberships.map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
      })),
    };
  }

  private async assertUserHasNoOrg(userId: string) {
    const existing = await this.prisma.membership.findFirst({
      where: { userId },
    });
    if (existing) {
      throw new ConflictException(
        'You already belong to an org — leave it before creating or joining another',
      );
    }
  }

  private toOrgResponse(
    org: { id: string; name: string; orgCode: string; referralToken: string },
    role: MembershipRole,
  ) {
    return {
      id: org.id,
      name: org.name,
      orgCode: org.orgCode,
      referralLink: org.referralToken,
      myRole: role,
    };
  }
}
