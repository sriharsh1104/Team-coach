import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MembershipService } from '../membership/membership.service';
import { UpsertTournamentRecordDto } from './dto/upsert-tournament-record.dto';
import { SACRED_TOURNAMENT_RECORD_SEED } from './tournament-records.seed';

export type TournamentRecordsPage = {
  items: Array<{
    id: string;
    name: string;
    status: string;
    kind: string;
    progress: string | null;
    qualifierDate: string | null;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

@Injectable()
export class WebsiteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: MembershipService,
  ) {}

  /** If coaches wipe the table (or migration seed never ran), restore sheet. */
  private async ensureSeeded() {
    const count = await this.prisma.websiteTournamentRecord.count();
    if (count > 0) return;
    await this.prisma.websiteTournamentRecord.createMany({
      data: SACRED_TOURNAMENT_RECORD_SEED,
      skipDuplicates: true,
    });
  }

  async listTournamentRecords(
    page = 1,
    pageSize = 10,
  ): Promise<TournamentRecordsPage> {
    await this.ensureSeeded();
    const safePage = Math.max(1, page);
    const safeSize = Math.min(50, Math.max(1, pageSize));
    const [total, items] = await this.prisma.$transaction([
      this.prisma.websiteTournamentRecord.count(),
      this.prisma.websiteTournamentRecord.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        skip: (safePage - 1) * safeSize,
        take: safeSize,
      }),
    ]);
    return {
      items,
      total,
      page: safePage,
      pageSize: safeSize,
      totalPages: Math.max(1, Math.ceil(total / safeSize)),
    };
  }

  private async assertCoachOrOwner(userId: string) {
    const membership = await this.memberships.getMembership(userId);
    const allowed =
      membership.isOwner || membership.role === MembershipRole.COACH;
    if (!allowed) {
      throw new ForbiddenException('Only coaches can update tournament records');
    }
    return membership;
  }

  async createTournamentRecord(userId: string, dto: UpsertTournamentRecordDto) {
    await this.assertCoachOrOwner(userId);
    const max = await this.prisma.websiteTournamentRecord.aggregate({
      _max: { sortOrder: true },
    });
    return this.prisma.websiteTournamentRecord.create({
      data: {
        name: dto.name.trim(),
        status: dto.status.trim(),
        kind: dto.kind,
        progress: dto.progress?.trim() || null,
        qualifierDate: dto.qualifierDate?.trim() || null,
        sortOrder: dto.sortOrder ?? (max._max.sortOrder ?? 0) + 1,
      },
    });
  }

  async updateTournamentRecord(
    userId: string,
    id: string,
    dto: UpsertTournamentRecordDto,
  ) {
    await this.assertCoachOrOwner(userId);
    const existing = await this.prisma.websiteTournamentRecord.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Record not found');
    return this.prisma.websiteTournamentRecord.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        status: dto.status.trim(),
        kind: dto.kind,
        progress: dto.progress?.trim() || null,
        qualifierDate: dto.qualifierDate?.trim() || null,
        ...(dto.sortOrder != null ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }

  async removeTournamentRecord(userId: string, id: string) {
    await this.assertCoachOrOwner(userId);
    const existing = await this.prisma.websiteTournamentRecord.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Record not found');
    await this.prisma.websiteTournamentRecord.delete({ where: { id } });
    return { ok: true };
  }
}
