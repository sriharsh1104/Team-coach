import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

/** The subset of Telegram's Update / Message shape we read. */
export interface TelegramMessage {
  from?: { id: number };
  chat: { id: number };
  text?: string;
  contact?: { phone_number: string; user_id?: number };
}

export interface TelegramUpdate {
  update_id?: number;
  message?: TelegramMessage;
}

/**
 * Thin wrapper over the Telegram Bot API. Config comes from env:
 *   TELEGRAM_BOT_TOKEN       — from @BotFather
 *   TELEGRAM_BOT_USERNAME    — the bot's username without the @
 *   TELEGRAM_WEBHOOK_SECRET  — random string; Telegram echoes it on every webhook call
 */
@Injectable()
export class TelegramBot {
  private readonly logger = new Logger(TelegramBot.name);

  constructor(private readonly config: ConfigService) {}

  get username(): string | undefined {
    return this.config.get<string>('TELEGRAM_BOT_USERNAME') || undefined;
  }

  isConfigured(): boolean {
    return !!(
      this.config.get<string>('TELEGRAM_BOT_TOKEN') &&
      this.username &&
      this.config.get<string>('TELEGRAM_WEBHOOK_SECRET')
    );
  }

  /** Constant-time check of the secret header Telegram sends with each webhook call. */
  secretMatches(provided: string | undefined): boolean {
    const expected = this.config.get<string>('TELEGRAM_WEBHOOK_SECRET');
    if (!expected || !provided) return false;
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** Best-effort: a failed reply must never fail the webhook (Telegram would retry it). */
  async sendMessage(
    chatId: bigint | number,
    text: string,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) return;
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId.toString(), text, ...extra }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) this.logger.warn(`Telegram sendMessage failed: HTTP ${res.status}`);
    } catch (err) {
      this.logger.warn(`Telegram sendMessage error: ${(err as Error).message}`);
    }
  }
}
