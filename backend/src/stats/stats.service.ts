import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { StatExtractionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import { MembershipService } from '../membership/membership.service';
import { StatsAiService, ExtractedPlayerStat } from './stats-ai.service';
import { UpdateExtractionRowsDto } from './dto/update-extraction-rows.dto';

export interface ExtractionRow {
  rawName: string;
  matchedUserId: string | null;
  kills: number;
  deaths: number;
  assists: number;
}

const EXTENSION_TO_MEDIA_TYPE: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly statsAi: StatsAiService,
    private readonly mediaService: MediaService,
    private readonly membershipService: MembershipService,
  ) {}

  async requestExtraction(userId: string, mediaPostId: string) {
    const membership = await this.requireMembership(userId);

    const mediaPost = await this.prisma.mediaPost.findUnique({
      where: { id: mediaPostId },
    });
    if (!mediaPost || mediaPost.orgId !== membership.orgId) {
      throw new NotFoundException('Media not found');
    }
    if (mediaPost.type !== 'IMAGE') {
      throw new BadRequestException(
        'Stat extraction only works on image screenshots, not videos',
      );
    }

    const existing = await this.prisma.statExtraction.findUnique({
      where: { mediaPostId },
    });
    if (existing) {
      throw new ConflictException(
        'This screenshot already has a stat extraction — view or edit the existing one',
      );
    }

    const uploadDir = join(
      process.cwd(),
      this.configService.get<string>('MEDIA_UPLOAD_DIR', 'uploads'),
    );
    const filePath = join(uploadDir, mediaPost.fileKey);
    const mediaType =
      EXTENSION_TO_MEDIA_TYPE[extname(mediaPost.fileKey).toLowerCase()];
    if (!mediaType) {
      throw new BadRequestException('Unsupported image format for extraction');
    }

    const fileBuffer = await readFile(filePath);
    const extracted = await this.statsAi.extractFromImage(
      fileBuffer.toString('base64'),
      mediaType,
    );

    const members = await this.prisma.user.findMany({
      where: { memberships: { some: { orgId: membership.orgId } } },
      select: { id: true, name: true, inGameName: true },
    });

    const rows: ExtractionRow[] = extracted.map((row) =>
      this.toRowWithMatch(row, members),
    );

    const extraction = await this.prisma.statExtraction.create({
      data: {
        orgId: membership.orgId,
        mediaPostId,
        requestedById: userId,
        rows: rows as unknown as object[],
      },
    });

    return this.toExtractionResponse(extraction, userId);
  }

  async list(userId: string) {
    const membership = await this.requireMembership(userId);
    const extractions = await this.prisma.statExtraction.findMany({
      where: { orgId: membership.orgId },
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

    const updated = await this.prisma.statExtraction.update({
      where: { id: extraction.id },
      data: { rows: dto.rows as unknown as object[] },
    });
    return this.toExtractionResponse(updated, userId);
  }

  async confirm(userId: string, extractionId: string) {
    const { extraction } = await this.requireReviewAccess(userId, extractionId);
    if (extraction.status !== StatExtractionStatus.PENDING) {
      throw new BadRequestException('This extraction was already reviewed');
    }

    const rows = extraction.rows as unknown as ExtractionRow[];
    const confirmableRows = rows.filter((r) => r.matchedUserId);

    const mediaPost = await this.prisma.mediaPost.findUniqueOrThrow({
      where: { id: extraction.mediaPostId },
    });

    await this.prisma.$transaction([
      ...confirmableRows.map((row) =>
        this.prisma.playerStat.create({
          data: {
            userId: row.matchedUserId as string,
            orgId: extraction.orgId,
            kills: row.kills,
            deaths: row.deaths,
            assists: row.assists,
            recordedAt: mediaPost.createdAt,
            extractionId: extraction.id,
          },
        }),
      ),
      this.prisma.statExtraction.update({
        where: { id: extraction.id },
        data: { status: StatExtractionStatus.CONFIRMED, reviewedAt: new Date() },
      }),
    ]);

    return { confirmedRows: confirmableRows.length, skippedRows: rows.length - confirmableRows.length };
  }

  async reject(userId: string, extractionId: string) {
    const { extraction } = await this.requireReviewAccess(userId, extractionId);
    if (extraction.status !== StatExtractionStatus.PENDING) {
      throw new BadRequestException('This extraction was already reviewed');
    }
    await this.prisma.statExtraction.update({
      where: { id: extraction.id },
      data: { status: StatExtractionStatus.REJECTED, reviewedAt: new Date() },
    });
  }

  async getPlayerStats(requesterId: string, targetUserId: string) {
    const requesterMembership = await this.requireMembership(requesterId);
    const targetMembership = await this.prisma.membership.findFirst({
      where: { userId: targetUserId },
    });
    if (!targetMembership || targetMembership.orgId !== requesterMembership.orgId) {
      throw new ForbiddenException(
        'You can only view stats for members of your own org',
      );
    }

    const entries = await this.prisma.playerStat.findMany({
      where: { userId: targetUserId },
      orderBy: { recordedAt: 'desc' },
    });

    return {
      totals: this.sumStats(entries),
      matches: entries.length,
      entries,
    };
  }

  async getOrgLeaderboard(userId: string) {
    const membership = await this.requireMembership(userId);
    const entries = await this.prisma.playerStat.findMany({
      where: { orgId: membership.orgId },
      include: { user: { select: { name: true } } },
    });

    const byUser = new Map<
      string,
      { userId: string; name: string; kills: number; deaths: number; assists: number; matches: number }
    >();
    for (const entry of entries) {
      const row = byUser.get(entry.userId) ?? {
        userId: entry.userId,
        name: entry.user.name,
        kills: 0,
        deaths: 0,
        assists: 0,
        matches: 0,
      };
      row.kills += entry.kills;
      row.deaths += entry.deaths;
      row.assists += entry.assists;
      row.matches += 1;
      byUser.set(entry.userId, row);
    }

    return [...byUser.values()].sort((a, b) => b.kills - a.kills);
  }

  private sumStats(entries: { kills: number; deaths: number; assists: number }[]) {
    return entries.reduce(
      (acc, e) => ({
        kills: acc.kills + e.kills,
        deaths: acc.deaths + e.deaths,
        assists: acc.assists + e.assists,
      }),
      { kills: 0, deaths: 0, assists: 0 },
    );
  }

  private toRowWithMatch(
    extracted: ExtractedPlayerStat,
    members: { id: string; name: string; inGameName: string | null }[],
  ): ExtractionRow {
    const normalized = extracted.name.trim().toLowerCase();
    const match = members.find(
      (m) =>
        m.name.toLowerCase() === normalized ||
        m.inGameName?.toLowerCase() === normalized,
    );
    return {
      rawName: extracted.name,
      matchedUserId: match?.id ?? null,
      kills: extracted.kills,
      deaths: extracted.deaths,
      assists: extracted.assists,
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

    const isRequester = extraction.requestedById === userId;
    const hasElevatedAccess = await this.membershipService.hasEditAccess(
      userId,
      membership.orgId,
    );
    if (!isRequester && !hasElevatedAccess) {
      throw new ForbiddenException(
        'Only the requester, the org owner, or a coach can review this extraction',
      );
    }

    return { extraction };
  }

  private async toExtractionResponse(
    extraction: {
      id: string;
      status: StatExtractionStatus;
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
      status: extraction.status,
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
