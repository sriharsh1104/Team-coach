import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationService } from '../common/push-notification.service';
import { ChatService } from './chat.service';

const TICK_MS = 60_000;
const MAX_MESSAGE = 40;

/**
 * Personal chat reminders — fire a push only to the creator when due.
 */
@Injectable()
export class ChatReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatReminderService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushNotificationService,
    private readonly chatService: ChatService,
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

  async create(
    userId: string,
    input: { channelKey: string; message: string; fireAt: string },
  ) {
    const message = input.message.trim().slice(0, MAX_MESSAGE);
    if (!message) {
      throw new BadRequestException('Reminder message is required');
    }
    const fireAt = new Date(input.fireAt);
    if (Number.isNaN(fireAt.getTime())) {
      throw new BadRequestException('Invalid reminder time');
    }
    // Allow a small clock skew; otherwise require a future time.
    if (fireAt.getTime() < Date.now() - 30_000) {
      throw new BadRequestException('Pick a future date and time');
    }

    const channelKey = input.channelKey.trim();
    const { orgId } = await this.chatService.resolveChannel(userId, channelKey);

    const row = await this.prisma.chatReminder.create({
      data: {
        userId,
        orgId,
        channelKey,
        message,
        fireAt,
      },
    });

    return {
      id: row.id,
      channelKey: row.channelKey,
      message: row.message,
      fireAt: row.fireAt.toISOString(),
    };
  }

  private async tick() {
    const due = await this.prisma.chatReminder.findMany({
      where: {
        sentAt: null,
        fireAt: { lte: new Date() },
      },
      include: {
        user: { select: { expoPushToken: true } },
      },
      take: 100,
    });

    for (const row of due) {
      const marked = await this.prisma.chatReminder.updateMany({
        where: { id: row.id, sentAt: null },
        data: { sentAt: new Date() },
      });
      if (marked.count === 0) continue;

      const token = row.user.expoPushToken;
      if (this.push.isValidExpoPushToken(token)) {
        await this.push.send([
          {
            to: token,
            title: 'Reminder',
            body: row.message,
            data: {
              type: 'chat_reminder',
              channelKey: row.channelKey,
              reminderId: row.id,
            },
            channelId: 'chat',
          },
        ]);
      }
      this.logger.log(
        `Fired chat reminder ${row.id} for user ${row.userId} channel=${row.channelKey}`,
      );
    }
  }
}
