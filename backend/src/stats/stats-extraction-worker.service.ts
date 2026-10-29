import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { StatExtractionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StatsService } from './stats.service';

const TICK_MS = 5_000;
const BATCH_SIZE = 3;

/**
 * Every 5s, claim up to 3 QUEUED extractions (oldest first) and OCR them one
 * at a time. Mirrors ScrimsReminderService's setInterval pattern — no queue/
 * Redis needed at this scale (Phase 1, single instance).
 *
 * Claiming is an atomic conditional update (QUEUED -> PROCESSING, only if it
 * actually matched a row) so two overlapping ticks can never both pick up the
 * same extraction.
 */
@Injectable()
export class StatsExtractionWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StatsExtractionWorkerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly statsService: StatsService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick().catch((err) =>
        this.logger.warn(`Extraction worker tick failed: ${(err as Error).message}`),
      );
    }, TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    const queued = await this.prisma.statExtraction.findMany({
      where: { status: StatExtractionStatus.QUEUED },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
      select: { id: true },
    });

    for (const { id } of queued) {
      const claimed = await this.prisma.statExtraction.updateMany({
        where: { id, status: StatExtractionStatus.QUEUED },
        data: { status: StatExtractionStatus.PROCESSING },
      });
      if (claimed.count === 0) continue; // another tick/instance already took it

      try {
        await this.statsService.processQueuedExtraction(id);
      } catch (err) {
        this.logger.warn(
          `Failed to process extraction ${id}: ${(err as Error).message}`,
        );
      }
    }
  }
}
