import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../users/users.service';
import { TelegramBot, TelegramMessage, TelegramUpdate } from './telegram-bot';

/** How long a "Verify on Telegram" link stays usable. */
export const PHONE_LINK_TTL_MS = 10 * 60 * 1000;

const SHARE_KEYBOARD = {
  keyboard: [[{ text: 'Share my number', request_contact: true }]],
  one_time_keyboard: true,
  resize_keyboard: true,
};
const REMOVE_KEYBOARD = { reply_markup: { remove_keyboard: true } };

@Injectable()
export class PhoneVerifyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bot: TelegramBot,
  ) {}

  /**
   * Creates a one-time link for the signed-in user. The phone is NOT saved
   * here — only after the user shares their own Telegram contact in the bot.
   */
  async startTelegramLink(userId: string) {
    if (!this.bot.isConfigured()) {
      throw new ServiceUnavailableException(
        'Telegram phone verification is not set up yet.',
      );
    }
    // Only one live link per user, so an old QR/link can't be used after a retry.
    const token = randomBytes(24).toString('base64url'); // 32 chars: valid in t.me start payloads
    const expiresAt = new Date(Date.now() + PHONE_LINK_TTL_MS);
    await this.prisma.$transaction([
      this.prisma.telegramPhoneLink.deleteMany({ where: { userId, usedAt: null } }),
      this.prisma.telegramPhoneLink.create({ data: { token, userId, expiresAt } }),
    ]);
    return {
      deepLink: `https://t.me/${this.bot.username}?start=${token}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    const msg = update?.message;
    if (!msg?.chat) return;
    if (msg.contact) return this.onContact(msg);
    if (msg.text && /^\/start(\s|$)/.test(msg.text)) return this.onStart(msg);
  }

  /** User opened the bot from the app: remember their chat and ask for their number. */
  private async onStart(msg: TelegramMessage) {
    const chatId = BigInt(msg.chat.id);
    const token = msg.text?.split(/\s+/)[1];
    if (!token) {
      await this.bot.sendMessage(
        chatId,
        'Open Team Coach in the app and tap "Verify phone on Telegram".',
      );
      return;
    }
    const link = await this.prisma.telegramPhoneLink.findUnique({ where: { token } });
    if (!link || link.usedAt || link.expiresAt <= new Date()) {
      await this.bot.sendMessage(
        chatId,
        'This link has expired. Go back to Team Coach and tap "Verify phone on Telegram" again.',
      );
      return;
    }
    await this.prisma.telegramPhoneLink.update({
      where: { token },
      data: { telegramChatId: chatId },
    });
    await this.bot.sendMessage(
      chatId,
      'Tap "Share my number" below to confirm your phone number for Team Coach.',
      { reply_markup: SHARE_KEYBOARD },
    );
  }

  /**
   * The phone comes from Telegram itself (the number on the user's Telegram
   * account), so it is proven rather than typed. We only accept a contact the
   * user shares themselves (`contact.user_id === from.id`) — forwarded contacts
   * of other people are rejected.
   */
  private async onContact(msg: TelegramMessage) {
    const chatId = BigInt(msg.chat.id);
    const contact = msg.contact;
    if (!contact || !msg.from || contact.user_id !== msg.from.id) {
      await this.bot.sendMessage(
        chatId,
        'Please share your own number with the "Share my number" button.',
      );
      return;
    }

    const link = await this.prisma.telegramPhoneLink.findFirst({
      where: { telegramChatId: chatId, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!link) {
      await this.bot.sendMessage(
        chatId,
        'No pending verification. Open Team Coach and tap "Verify phone on Telegram" again.',
        REMOVE_KEYBOARD,
      );
      return;
    }

    const phone = normalizePhone(contact.phone_number);
    if (phone.length < 8 || phone.length > 15) {
      await this.bot.sendMessage(chatId, 'That number does not look valid.', REMOVE_KEYBOARD);
      return;
    }

    const taken = await this.prisma.user.findFirst({
      where: { phone, id: { not: link.userId } },
      select: { id: true },
    });
    if (taken) {
      await this.bot.sendMessage(
        chatId,
        'This number is already linked to another Team Coach account.',
        REMOVE_KEYBOARD,
      );
      return;
    }

    try {
      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: link.userId },
          data: { phone, phoneVerifiedAt: new Date() },
        }),
        this.prisma.telegramPhoneLink.update({
          where: { token: link.token },
          data: { usedAt: new Date() },
        }),
      ]);
    } catch (err) {
      // Lost a race with another account claiming the same number.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        await this.bot.sendMessage(
          chatId,
          'This number is already linked to another Team Coach account.',
          REMOVE_KEYBOARD,
        );
        return;
      }
      throw err;
    }

    await this.bot.sendMessage(
      chatId,
      '✅ Phone verified! Go back to Team Coach — it will update in a moment.',
      REMOVE_KEYBOARD,
    );
  }
}
