import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../users/users.service';
import { TelegramBot, TelegramMessage, TelegramUpdate } from './telegram-bot';

/** How long a "Verify on Telegram" link stays usable. */
export const PHONE_LINK_TTL_MS = 10 * 60 * 1000;
/** How long the 6-digit code the bot sends stays valid. */
export const PHONE_CODE_TTL_MS = 10 * 60 * 1000;
/** Wrong guesses allowed per link before it is dead (6 digits ⇒ 1e6 combos). */
export const PHONE_CODE_MAX_ATTEMPTS = 5;

const SHARE_KEYBOARD = {
  keyboard: [[{ text: 'Share my number', request_contact: true }]],
  one_time_keyboard: true,
  resize_keyboard: true,
};
const REMOVE_KEYBOARD = { reply_markup: { remove_keyboard: true } };

function isPlausiblePhone(phone: string) {
  return phone.length >= 8 && phone.length <= 15;
}

function hashCode(token: string, code: string) {
  return createHash('sha256').update(`${token}:${code}`).digest('hex');
}

@Injectable()
export class PhoneVerifyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bot: TelegramBot,
  ) {}

  /**
   * Step 1 (app): the user typed their number. We remember it on a one-time
   * link and hand back the bot deep link. The phone is NOT saved on the user
   * here — only after they share the matching Telegram contact (step 2) and
   * type the code the bot sends back (step 3).
   */
  async startTelegramLink(userId: string, rawPhone: string) {
    if (!this.bot.isConfigured()) {
      throw new ServiceUnavailableException(
        'Telegram phone verification is not set up yet.',
      );
    }
    const phone = normalizePhone(rawPhone);
    if (!isPlausiblePhone(phone)) {
      throw new BadRequestException('Enter a valid phone number.');
    }
    const taken = await this.prisma.user.findFirst({
      where: { phone, id: { not: userId } },
      select: { id: true },
    });
    if (taken) throw new ConflictException('That phone number is already in use');

    // Only one live link per user, so an old QR/link can't be used after a retry.
    const token = randomBytes(24).toString('base64url'); // 32 chars: valid in t.me start payloads
    const expiresAt = new Date(Date.now() + PHONE_LINK_TTL_MS);
    await this.prisma.$transaction([
      this.prisma.telegramPhoneLink.deleteMany({ where: { userId, usedAt: null } }),
      this.prisma.telegramPhoneLink.create({
        data: { token, userId, phone, expiresAt },
      }),
    ]);
    return {
      deepLink: `https://t.me/${this.bot.username}?start=${token}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /** Step 3 (app): the user types the code the bot sent to their Telegram chat. */
  async confirmCode(userId: string, code: string) {
    const link = await this.prisma.telegramPhoneLink.findFirst({
      where: {
        userId,
        usedAt: null,
        expiresAt: { gt: new Date() },
        codeHash: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!link || !link.codeHash || !link.phone) {
      throw new BadRequestException(
        'No code is waiting. Tap "Verify on Telegram" to get a new one.',
      );
    }
    if (!link.codeExpiresAt || link.codeExpiresAt <= new Date()) {
      throw new BadRequestException(
        'That code has expired. Tap "Verify on Telegram" to get a new one.',
      );
    }

    // Count the attempt first and atomically, so parallel guesses can't beat the cap.
    const counted = await this.prisma.telegramPhoneLink.updateMany({
      where: { token: link.token, attempts: { lt: PHONE_CODE_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (counted.count === 0) {
      throw new BadRequestException(
        'Too many wrong codes. Tap "Verify on Telegram" to get a new one.',
      );
    }

    const given = Buffer.from(hashCode(link.token, code));
    const expected = Buffer.from(link.codeHash);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new BadRequestException('Incorrect code. Check Telegram and try again.');
    }

    const taken = await this.prisma.user.findFirst({
      where: { phone: link.phone, id: { not: userId } },
      select: { id: true },
    });
    if (taken) throw new ConflictException('That phone number is already in use');

    try {
      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: userId },
          data: { phone: link.phone, phoneVerifiedAt: new Date() },
        }),
        this.prisma.telegramPhoneLink.update({
          where: { token: link.token },
          data: { usedAt: new Date() },
        }),
      ]);
    } catch (err) {
      // Lost a race with another account claiming the same number.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('That phone number is already in use');
      }
      throw err;
    }
    return { phone: link.phone };
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
        'Open Team Coach in the app and tap "Verify on Telegram".',
      );
      return;
    }
    const link = await this.prisma.telegramPhoneLink.findUnique({ where: { token } });
    if (!link || link.usedAt || link.expiresAt <= new Date()) {
      await this.bot.sendMessage(
        chatId,
        'This link has expired. Go back to Team Coach and tap "Verify on Telegram" again.',
      );
      return;
    }
    await this.prisma.telegramPhoneLink.update({
      where: { token },
      data: { telegramChatId: chatId },
    });
    await this.bot.sendMessage(
      chatId,
      'Tap "Share my number" below. We will send you a 6-digit code to type in Team Coach.',
      { reply_markup: SHARE_KEYBOARD },
    );
  }

  /**
   * The shared contact is the number on the user's own Telegram account, so it
   * proves they control it. We only accept a contact they share themselves
   * (`contact.user_id === from.id`), and it must match the number they typed in
   * the app. Then the bot sends the code they enter back in the app.
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
    if (!link || !link.phone) {
      await this.bot.sendMessage(
        chatId,
        'No pending verification. Open Team Coach and tap "Verify on Telegram" again.',
        REMOVE_KEYBOARD,
      );
      return;
    }

    const shared = normalizePhone(contact.phone_number);
    if (!isPlausiblePhone(shared)) {
      await this.bot.sendMessage(chatId, 'That number does not look valid.', REMOVE_KEYBOARD);
      return;
    }
    if (shared !== link.phone) {
      await this.bot.sendMessage(
        chatId,
        'This Telegram number is different from the number you entered in Team Coach. Go back to the app, enter the number of this Telegram account, and tap "Verify on Telegram" again.',
        REMOVE_KEYBOARD,
      );
      return;
    }

    const taken = await this.prisma.user.findFirst({
      where: { phone: shared, id: { not: link.userId } },
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

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.prisma.telegramPhoneLink.update({
      where: { token: link.token },
      data: {
        codeHash: hashCode(link.token, code),
        codeExpiresAt: new Date(Date.now() + PHONE_CODE_TTL_MS),
        attempts: 0,
      },
    });
    await this.bot.sendMessage(
      chatId,
      `Your Team Coach verification code is ${code}\n\nType it in the app to verify your phone. It expires in 10 minutes. Never share it with anyone.`,
      REMOVE_KEYBOARD,
    );
  }
}
