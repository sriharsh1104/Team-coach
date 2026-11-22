import { Injectable, NotFoundException } from '@nestjs/common';
import { Membership, MembershipRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  // "Must be in an org" — the same lookup scrims/stats/media/users all did
  // inline before this was pulled out.
  async getMembership(userId: string): Promise<Membership> {
    const membership = await this.prisma.membership.findFirst({
      where: { userId },
    });
    if (!membership) {
      throw new NotFoundException('You are not part of an org yet');
    }
    return membership;
  }

  /**
   * The user's org, from either seat, or null when they have none. Unlike
   * [getMembership] this never throws — realtime needs to serve people who
   * are guild-only, or not in an org at all (waiting on a join request).
   */
  async findOrgId(userId: string): Promise<string | null> {
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
    return roster?.orgId ?? guild?.orgId ?? null;
  }

  // The org owner, or any coach, in this specific org. Used by scrims/stats'
  // "creator-or-elevated-access" edit/review gates — the org owner gets this
  // regardless of which functional role (PLAYER/COACH/ANALYST) they hold.
  async hasEditAccess(userId: string, orgId: string): Promise<boolean> {
    const membership = await this.prisma.membership.findFirst({
      where: { userId, orgId },
    });
    if (!membership) return false;
    return membership.isOwner || membership.role === MembershipRole.COACH;
  }
}
