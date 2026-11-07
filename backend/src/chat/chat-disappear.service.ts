import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ChatService } from './chat.service';

/** Periodically hard-deletes messages past each channel's disappear timer. */
@Injectable()
export class ChatDisappearService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatDisappearService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly chatService: ChatService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick();
    }, 60_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick() {
    try {
      const deleted = await this.chatService.purgeExpiredMessages();
      if (deleted > 0) {
        this.logger.log(`Purged ${deleted} expired chat message(s)`);
      }
    } catch (err) {
      this.logger.warn(`Disappear purge failed: ${(err as Error).message}`);
    }
  }
}
