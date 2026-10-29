import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MembershipService } from '../membership/membership.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CreateScrimEventDto } from './dto/create-scrim-event.dto';
import { UpdateScrimEventDto } from './dto/update-scrim-event.dto';

@Injectable()
export class ScrimsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membershipService: MembershipService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(userId: string, dto: CreateScrimEventDto) {
    const membership = await this.requireMembership(userId);
    const rounds = this.normalizeRounds(dto);

    const event = await this.prisma.scrimEvent.create({
      data: {
        orgId: membership.orgId,
        createdById: userId,
        type: dto.type,
        title: dto.title,
        scheduledAt: new Date(dto.scheduledAt),
        platform: dto.platform,
        notes: dto.notes,
        remind30: dto.remind30 ?? true,
        remind10: dto.remind10 ?? true,
        rounds: {
          create: rounds.map((r) => ({
            roundNumber: r.roundNumber,
            scheduledAt: new Date(r.scheduledAt),
            result: r.result ?? 'PENDING',
          })),
        },
      },
      include: {
        rounds: { orderBy: { roundNumber: 'asc' } },
        createdBy: { select: { name: true } },
      },
    });
    this.realtime.publish(membership.orgId, 'scrims.changed');
    return this.toResponse(event, membership.userName);
  }

  async list(userId: string) {
    const membership = await this.requireMembership(userId);
    const events = await this.prisma.scrimEvent.findMany({
      where: { orgId: membership.orgId },
      include: {
        createdBy: { select: { name: true } },
        rounds: { orderBy: { roundNumber: 'asc' } },
      },
      orderBy: { scheduledAt: 'asc' },
    });
    return events.map((e) => this.toResponse(e, e.createdBy.name));
  }

  async update(userId: string, eventId: string, dto: UpdateScrimEventDto) {
    const { event } = await this.requireEditAccess(userId, eventId);

    if (dto.rounds) {
      const rounds = this.normalizeRounds({
        scheduledAt: dto.scheduledAt ?? event.scheduledAt.toISOString(),
        rounds: dto.rounds,
      });
      await this.prisma.$transaction([
        this.prisma.scrimRound.deleteMany({ where: { eventId: event.id } }),
        this.prisma.scrimRound.createMany({
          data: rounds.map((r) => ({
            eventId: event.id,
            roundNumber: r.roundNumber,
            scheduledAt: new Date(r.scheduledAt),
            result: r.result ?? 'PENDING',
          })),
        }),
      ]);
    }

    const updated = await this.prisma.scrimEvent.update({
      where: { id: event.id },
      data: {
        ...(dto.type ? { type: dto.type } : {}),
        ...(dto.title ? { title: dto.title } : {}),
        ...(dto.scheduledAt ? { scheduledAt: new Date(dto.scheduledAt) } : {}),
        ...(dto.platform !== undefined ? { platform: dto.platform } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.remind30 !== undefined ? { remind30: dto.remind30 } : {}),
        ...(dto.remind10 !== undefined ? { remind10: dto.remind10 } : {}),
      },
      include: {
        createdBy: { select: { name: true } },
        rounds: { orderBy: { roundNumber: 'asc' } },
      },
    });
    this.realtime.publish(event.orgId, 'scrims.changed');
    return this.toResponse(updated, updated.createdBy.name);
  }

  async remove(userId: string, eventId: string) {
    const { event } = await this.requireEditAccess(userId, eventId);
    await this.prisma.scrimEvent.delete({ where: { id: event.id } });
    this.realtime.publish(event.orgId, 'scrims.changed');
  }

  private normalizeRounds(dto: {
    scheduledAt: string;
    rounds?: CreateScrimEventDto['rounds'];
  }) {
    if (dto.rounds && dto.rounds.length > 0) {
      return [...dto.rounds].sort((a, b) => a.roundNumber - b.roundNumber);
    }
    return [
      {
        roundNumber: 1,
        scheduledAt: dto.scheduledAt,
        result: 'PENDING' as const,
      },
    ];
  }

  private async requireMembership(userId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId },
      include: { user: { select: { name: true } } },
    });
    if (!membership) {
      throw new NotFoundException('You are not part of an org yet');
    }
    return { orgId: membership.orgId, userName: membership.user.name };
  }

  private async requireEditAccess(userId: string, eventId: string) {
    const membership = await this.requireMembership(userId);
    const event = await this.prisma.scrimEvent.findUnique({
      where: { id: eventId },
    });
    if (!event || event.orgId !== membership.orgId) {
      throw new NotFoundException('Scrim/tournament entry not found');
    }

    const isCreator = event.createdById === userId;
    const hasElevatedAccess = await this.membershipService.hasEditAccess(
      userId,
      membership.orgId,
    );

    if (!isCreator && !hasElevatedAccess) {
      throw new ForbiddenException(
        'Only the creator, the org owner, or a coach can edit or delete this entry',
      );
    }

    return { event };
  }

  private toResponse(
    event: {
      id: string;
      type: string;
      title: string;
      scheduledAt: Date;
      platform: string | null;
      notes: string | null;
      createdById: string;
      remind30?: boolean;
      remind10?: boolean;
      rounds?: Array<{
        id: string;
        roundNumber: number;
        scheduledAt: Date;
        result: string;
      }>;
    },
    createdByName: string,
  ) {
    return {
      id: event.id,
      type: event.type,
      title: event.title,
      scheduledAt: event.scheduledAt,
      platform: event.platform,
      notes: event.notes,
      createdById: event.createdById,
      createdByName,
      remind30: event.remind30 ?? true,
      remind10: event.remind10 ?? true,
      rounds: (event.rounds ?? []).map((r) => ({
        id: r.id,
        roundNumber: r.roundNumber,
        scheduledAt: r.scheduledAt,
        result: r.result,
      })),
    };
  }
}
