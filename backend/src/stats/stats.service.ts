import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StatExtractionStatus, StatMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import { MediaStorageService } from '../media/media-storage.service';
import { MembershipService } from '../membership/membership.service';
import { RealtimeService } from '../realtime/realtime.service';
import { StatsAiService, ExtractedPlayerStat } from './stats-ai.service';
import { UpdateExtractionRowsDto } from './dto/update-extraction-rows.dto';

export interface ExtractionRow {
  rawName: string;
  matchedUserId: string | null;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
}

const DEFAULT_HISTORY_PAGE_SIZE = 50;

export interface PageOptions {
  cursor?: string;
  limit?: number;
}

/** Collapse Free Fire IGN noise so "SES-SRI" / "ses sri" / "SES~SRI" still match. */
export function normalizeIgn(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[~·•._\-\s]+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly statsAi: StatsAiService,
    private readonly mediaService: MediaService,
    private readonly mediaStorage: MediaStorageService,
    private readonly membershipService: MembershipService,
    private readonly realtime: RealtimeService,
  ) {}

  private notifyStatsChanged(orgId: string) {
    this.realtime.publish(orgId, 'stats.changed');
  }

  // Fast, OCR-free write — each screenshot is created as QUEUED and picked up
  // later by StatsExtractionWorkerService. A problem with one item (duplicate,
  // wrong org, video) is skipped rather than failing the whole batch.
  async requestExtractions(
    userId: string,
    input: { mode: StatMode; mediaPostIds: string[]; scrimEventId?: string },
  ) {
    const membership = await this.requireMembership(userId);

    if (input.scrimEventId) {
      const event = await this.prisma.scrimEvent.findUnique({
        where: { id: input.scrimEventId },
      });
      if (!event || event.orgId !== membership.orgId) {
        throw new NotFoundException('Scrim / tournament event not found');
      }
      const expectedMode =
        event.type === 'TOURNAMENT' ? StatMode.TOURNAMENT : StatMode.SCRIM;
      if (input.mode !== expectedMode) {
        throw new BadRequestException(
          `This event requires mode ${expectedMode}`,
        );
      }
    }

    const created: Awaited<ReturnType<typeof this.toExtractionResponse>>[] = [];
    const skipped: { mediaPostId: string; reason: string }[] = [];

    for (const mediaPostId of input.mediaPostIds) {
      try {
        const extraction = await this.createQueuedExtraction(
          userId,
          membership.orgId,
          { mode: input.mode, mediaPostId, scrimEventId: input.scrimEventId },
        );
        created.push(await this.toExtractionResponse(extraction, userId));
      } catch (err) {
        // Only a duplicate (someone already requested extraction on this
        // screenshot) is benign enough to skip and keep going — a genuine
        // validation/security problem (wrong org, missing, wrong type) still
        // fails the whole batch rather than silently dropping it.
        if (err instanceof ConflictException) {
          skipped.push({ mediaPostId, reason: err.message });
        } else {
          throw err;
        }
      }
    }

    if (created.length > 0) {
      this.notifyStatsChanged(membership.orgId);
    }
    return { created, skipped };
  }

  private async createQueuedExtraction(
    userId: string,
    orgId: string,
    input: { mode: StatMode; mediaPostId: string; scrimEventId?: string },
  ) {
    const mediaPost = await this.prisma.mediaPost.findUnique({
      where: { id: input.mediaPostId },
    });
    if (!mediaPost || mediaPost.orgId !== orgId) {
      throw new NotFoundException('Media not found');
    }
    if (mediaPost.type !== 'IMAGE') {
      throw new BadRequestException(
        'Stat extraction only works on image screenshots, not videos',
      );
    }

    const existing = await this.prisma.statExtraction.findUnique({
      where: { mediaPostId: mediaPost.id },
    });
    if (existing) {
      throw new ConflictException(
        'This screenshot already has a stat extraction — view or edit the existing one',
      );
    }

    return this.prisma.statExtraction.create({
      data: {
        orgId,
        mediaPostId: mediaPost.id,
        requestedById: userId,
        mode: input.mode,
        scrimEventId: input.scrimEventId ?? null,
        rows: [] as unknown as object[],
      },
      include: { mediaPost: true },
    });
  }

  // Called by StatsExtractionWorkerService once it has atomically claimed a
  // QUEUED row (flipped it to PROCESSING) — also callable directly (tests,
  // retry-then-immediately-process tooling) since it doesn't re-check status
  // itself, it just does the OCR work and records the outcome.
  async processQueuedExtraction(extractionId: string): Promise<void> {
    const extraction = await this.prisma.statExtraction.findUnique({
      where: { id: extractionId },
    });
    if (!extraction) return;

    try {
      const mediaPost = await this.prisma.mediaPost.findUniqueOrThrow({
        where: { id: extraction.mediaPostId },
      });
      const { buffer: fileBuffer, mediaType } =
        await this.mediaStorage.readFileBuffer(mediaPost.fileKey);
      if (!mediaType.startsWith('image/')) {
        throw new Error('Unsupported image format for extraction');
      }

      const extracted = await this.statsAi.extractFromImage(
        fileBuffer.toString('base64'),
        mediaType,
      );

      const members = await this.prisma.user.findMany({
        where: { memberships: { some: { orgId: extraction.orgId } } },
        select: { id: true, name: true, inGameName: true },
      });
      const rows: ExtractionRow[] = extracted.map((row) =>
        this.toRowWithMatch(row, members),
      );

      await this.prisma.statExtraction.update({
        where: { id: extractionId },
        data: {
          rows: rows as unknown as object[],
          status: StatExtractionStatus.PENDING,
        },
      });
      this.notifyStatsChanged(extraction.orgId);
    } catch (err) {
      await this.prisma.statExtraction.update({
        where: { id: extractionId },
        data: {
          status: StatExtractionStatus.FAILED,
          failureReason: (err as Error).message,
        },
      });
      this.notifyStatsChanged(extraction.orgId);
    }
  }

  async retry(userId: string, extractionId: string) {
    const membership = await this.requireMembership(userId);
    const extraction = await this.prisma.statExtraction.findUnique({
      where: { id: extractionId },
    });
    if (!extraction || extraction.orgId !== membership.orgId) {
      throw new NotFoundException('Stat extraction not found');
    }
    if (extraction.status !== StatExtractionStatus.FAILED) {
      throw new BadRequestException('Only a failed extraction can be retried');
    }

    // Retry is requester-or-reviewer, not review-only — nothing has been
    // reviewed yet, so the person who uploaded it can also just try again.
    const isRequester = extraction.requestedById === userId;
    const hasElevatedAccess = await this.membershipService.hasEditAccess(
      userId,
      membership.orgId,
    );
    if (!isRequester && !hasElevatedAccess) {
      throw new ForbiddenException(
        'Only the requester, the org owner, or a coach can retry this extraction',
      );
    }

    const updated = await this.prisma.statExtraction.update({
      where: { id: extractionId },
      data: {
        status: StatExtractionStatus.QUEUED,
        failureReason: null,
        rows: [] as unknown as object[],
      },
    });
    this.notifyStatsChanged(membership.orgId);
    return this.toExtractionResponse(updated, userId);
  }

  async getOne(userId: string, extractionId: string) {
    const membership = await this.requireMembership(userId);
    const extraction = await this.prisma.statExtraction.findUnique({
      where: { id: extractionId },
      include: { mediaPost: true },
    });
    if (!extraction || extraction.orgId !== membership.orgId) {
      throw new NotFoundException('Stat extraction not found');
    }
    return this.toExtractionResponse(extraction, userId);
  }

  async list(userId: string, mode?: StatMode) {
    const membership = await this.requireMembership(userId);
    const extractions = await this.prisma.statExtraction.findMany({
      where: {
        orgId: membership.orgId,
        ...(mode ? { mode } : {}),
      },
      include: { mediaPost: true },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      extractions.map((e) => this.toExtractionResponse(e, userId)),
    );
  }

  async updateRows(
    userId: string,
    extractionId: string,
    dto: UpdateExtractionRowsDto,
  ) {
    const { extraction } = await this.requireReviewAccess(userId, extractionId);
    if (extraction.status !== StatExtractionStatus.PENDING) {
      throw new BadRequestException('Only pending extractions can be edited');
    }

    const rows: ExtractionRow[] = dto.rows.map((r) => ({
      ...r,
      matchedUserId: r.matchedUserId ?? null,
      damage: r.damage ?? 0,
    }));
    const updated = await this.prisma.statExtraction.update({
      where: { id: extraction.id },
      data: { rows: rows as unknown as object[] },
    });
    return this.toExtractionResponse(updated, userId);
  }

  async confirm(userId: string, extractionId: string) {
    const { extraction } = await this.requireReviewAccess(userId, extractionId);
    if (extraction.status !== StatExtractionStatus.PENDING) {
      throw new BadRequestException('This extraction was already reviewed');
    }

    const rows = extraction.rows as unknown as ExtractionRow[];
    // Only org teammates with an explicit match are written — outsiders on the
    // Free Fire scoreboard (unmatched IGNs) are never saved to PlayerStat.
    const confirmableRows = rows.filter((r) => r.matchedUserId);
    if (confirmableRows.length === 0) {
      throw new BadRequestException(
        'Match at least one scoreboard name to a teammate (set In-Game Name on Profile) before saving.',
      );
    }

    const mediaPost = await this.prisma.mediaPost.findUniqueOrThrow({
      where: { id: extraction.mediaPostId },
    });

    // Persist only the teammate rows so the extraction record matches what was saved.
    const teammateRows = confirmableRows;

    await this.prisma.$transaction([
      this.prisma.statExtraction.update({
        where: { id: extraction.id },
        data: {
          rows: teammateRows as unknown as object[],
          status: StatExtractionStatus.CONFIRMED,
          reviewedAt: new Date(),
        },
      }),
      ...teammateRows.map((row) =>
        this.prisma.playerStat.create({
          data: {
            userId: row.matchedUserId as string,
            orgId: extraction.orgId,
            mode: extraction.mode,
            kills: row.kills,
            deaths: row.deaths,
            assists: row.assists,
            damage: row.damage,
            recordedAt: mediaPost.createdAt,
            extractionId: extraction.id,
          },
        }),
      ),
    ]);

    this.notifyStatsChanged(extraction.orgId);
    return {
      confirmedRows: teammateRows.length,
      skippedRows: rows.length - teammateRows.length,
    };
  }

  async reject(userId: string, extractionId: string) {
    const { extraction } = await this.requireReviewAccess(userId, extractionId);
    // FAILED is dismissible too — discarding a screenshot OCR couldn't read
    // is the same "review" decision as rejecting one the AI did read.
    if (
      extraction.status !== StatExtractionStatus.PENDING &&
      extraction.status !== StatExtractionStatus.FAILED
    ) {
      throw new BadRequestException('This extraction was already reviewed');
    }
    await this.prisma.statExtraction.update({
      where: { id: extraction.id },
      data: { status: StatExtractionStatus.REJECTED, reviewedAt: new Date() },
    });
    this.notifyStatsChanged(extraction.orgId);
  }

  async getPlayerStats(
    requesterId: string,
    targetUserId: string,
    mode: StatMode,
    pagination: PageOptions = {},
  ) {
    const requesterMembership = await this.requireMembership(requesterId);
    const targetMembership = await this.prisma.membership.findFirst({
      where: { userId: targetUserId },
    });
    if (!targetMembership || targetMembership.orgId !== requesterMembership.orgId) {
      throw new ForbiddenException(
        'You can only view stats for members of your own org',
      );
    }

    const limit = pagination.limit ?? DEFAULT_HISTORY_PAGE_SIZE;
    const where = { userId: targetUserId, mode };

    // Totals/matches always reflect the player's FULL history, independent of
    // how many entries are paginated below — a cheap indexed aggregate, not a
    // full row fetch, so it doesn't reintroduce the unbounded-scan problem.
    const [entries, aggregate] = await Promise.all([
      this.prisma.playerStat.findMany({
        where,
        orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
        take: limit,
        ...(pagination.cursor
          ? { cursor: { id: pagination.cursor }, skip: 1 }
          : {}),
      }),
      this.prisma.playerStat.aggregate({
        where,
        _sum: { kills: true, deaths: true, assists: true, damage: true },
        _count: true,
      }),
    ]);

    return {
      mode,
      totals: {
        kills: aggregate._sum.kills ?? 0,
        deaths: aggregate._sum.deaths ?? 0,
        assists: aggregate._sum.assists ?? 0,
        damage: aggregate._sum.damage ?? 0,
      },
      matches: aggregate._count,
      entries,
      nextCursor:
        entries.length === limit ? entries[entries.length - 1].id : null,
    };
  }

  async getOrgLeaderboard(userId: string, mode: StatMode) {
    const membership = await this.requireMembership(userId);
    const entries = await this.prisma.playerStat.findMany({
      where: { orgId: membership.orgId, mode },
      include: { user: { select: { name: true } } },
    });

    const byUser = new Map<
      string,
      {
        userId: string;
        name: string;
        mode: StatMode;
        kills: number;
        deaths: number;
        assists: number;
        damage: number;
        matches: number;
      }
    >();
    for (const entry of entries) {
      const row = byUser.get(entry.userId) ?? {
        userId: entry.userId,
        name: entry.user.name,
        mode,
        kills: 0,
        deaths: 0,
        assists: 0,
        damage: 0,
        matches: 0,
      };
      row.kills += entry.kills;
      row.deaths += entry.deaths;
      row.assists += entry.assists;
      row.damage += entry.damage;
      row.matches += 1;
      byUser.set(entry.userId, row);
    }

    return [...byUser.values()].sort((a, b) => b.kills - a.kills);
  }

  /** Confirmed match rows for a mode, newest first — client groups by calendar day. */
  async getModeHistory(
    userId: string,
    mode: StatMode,
    pagination: PageOptions = {},
  ) {
    const membership = await this.requireMembership(userId);
    const limit = pagination.limit ?? DEFAULT_HISTORY_PAGE_SIZE;
    const entries = await this.prisma.playerStat.findMany({
      where: { orgId: membership.orgId, mode },
      include: { user: { select: { id: true, name: true } } },
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(pagination.cursor
        ? { cursor: { id: pagination.cursor }, skip: 1 }
        : {}),
    });

    return {
      mode,
      entries: entries.map((e) => ({
        id: e.id,
        userId: e.userId,
        name: e.user.name,
        mode,
        kills: e.kills,
        deaths: e.deaths,
        assists: e.assists,
        damage: e.damage,
        recordedAt: e.recordedAt,
      })),
      nextCursor:
        entries.length === limit ? entries[entries.length - 1].id : null,
    };
  }

  private toRowWithMatch(
    extracted: ExtractedPlayerStat,
    members: { id: string; name: string; inGameName: string | null }[],
  ): ExtractionRow {
    const raw = extracted.name.trim();
    const key = normalizeIgn(raw);
    // Prefer in-game name (Free Fire IGN) over app display name.
    const match =
      members.find((m) => m.inGameName && normalizeIgn(m.inGameName) === key) ??
      members.find((m) => normalizeIgn(m.name) === key) ??
      null;
    return {
      rawName: raw,
      matchedUserId: match?.id ?? null,
      kills: extracted.kills,
      deaths: extracted.deaths,
      assists: extracted.assists,
      damage: extracted.damage,
    };
  }

  private async requireMembership(userId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId },
    });
    if (!membership) {
      throw new NotFoundException('You are not part of an org yet');
    }
    return membership;
  }

  private async requireReviewAccess(userId: string, extractionId: string) {
    const membership = await this.requireMembership(userId);
    const extraction = await this.prisma.statExtraction.findUnique({
      where: { id: extractionId },
    });
    if (!extraction || extraction.orgId !== membership.orgId) {
      throw new NotFoundException('Stat extraction not found');
    }

    const hasElevatedAccess = await this.membershipService.hasEditAccess(
      userId,
      membership.orgId,
    );
    if (!hasElevatedAccess) {
      throw new ForbiddenException(
        'Only the org owner or a coach can review this extraction',
      );
    }

    return { extraction };
  }

  private async toExtractionResponse(
    extraction: {
      id: string;
      mode: StatMode;
      scrimEventId?: string | null;
      status: StatExtractionStatus;
      failureReason?: string | null;
      rows: unknown;
      createdAt: Date;
      reviewedAt: Date | null;
      mediaPostId: string;
      mediaPost?: { fileKey: string };
    },
    viewerUserId: string,
  ) {
    return {
      id: extraction.id,
      mode: extraction.mode,
      scrimEventId: extraction.scrimEventId ?? null,
      status: extraction.status,
      failureReason: extraction.failureReason ?? null,
      rows: extraction.rows as unknown as ExtractionRow[],
      createdAt: extraction.createdAt,
      reviewedAt: extraction.reviewedAt,
      mediaPostId: extraction.mediaPostId,
      mediaUrl: extraction.mediaPost
        ? await this.mediaService.buildFileUrl(
            extraction.mediaPost.fileKey,
            viewerUserId,
          )
        : undefined,
    };
  }
}
