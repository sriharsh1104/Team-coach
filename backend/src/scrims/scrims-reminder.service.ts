import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationService, PushMessage } from '../common/push-notification.service';

const TICK_MS = 60_000;
const WINDOW_MS = 60_000; // fire once inside the matching minute window

/**
 * Every minute, find rounds whose start is ~30m or ~10m away and push the
 * whole org (count/title only — no sensitive body). Deduped via in-memory set
 * for the process lifetime (fine for single-instance Phase 1).
 */
@Injectable()
export class ScrimsReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScrimsReminderService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly sent = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushNotificationService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick().catch((err) =>
        this.logger.warn(`Reminder tick failed: ${(err as Error).message}`),
      );
    }, TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    const now = Date.now();
    await this.fireForOffset(now, 30, 'remind30');
    await this.fireForOffset(now, 10, 'remind10');
  }

  private async fireForOffset(
    now: number,
    minutesBefore: number,
    flag: 'remind30' | 'remind10',
  ) {
    const target = now + minutesBefore * 60_000;
    const from = new Date(target - WINDOW_MS / 2);
    const to = new Date(target + WINDOW_MS / 2);

    const rounds = await this.prisma.scrimRound.findMany({
      where: {
        scheduledAt: { gte: from, lte: to },
        event: { [flag]: true },
      },
      include: {
        event: {
          include: {
            org: {
              include: {
                memberships: { include: { user: true } },
              },
            },
          },
        },
      },
    });

    for (const round of rounds) {
      const key = `${round.id}:${minutesBefore}`;
      if (this.sent.has(key)) continue;
      this.sent.add(key);

      const title = round.event.title;
      const body = `${title} — Round ${round.roundNumber} starts in ${minutesBefore} min`;
      const messages: PushMessage[] = round.event.org.memberships
        .filter((m) => this.push.isValidExpoPushToken(m.user.expoPushToken))
        .map((m) => ({
          to: m.user.expoPushToken!,
          title: 'Upcoming Match',
          body,
          data: {
            type: 'scrim_reminder',
            eventId: round.eventId,
            roundNumber: round.roundNumber,
            minutesBefore,
          },
        }));

      if (messages.length) {
        await this.push.send(messages);
        this.logger.log(
          `Sent ${minutesBefore}m reminder for ${title} R${round.roundNumber} to ${messages.length} member(s)`,
        );
      }
    }
  }
}
