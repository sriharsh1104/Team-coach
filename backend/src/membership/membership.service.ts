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
