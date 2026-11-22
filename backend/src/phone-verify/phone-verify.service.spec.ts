import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import {
  PhoneVerifyService,
  PHONE_CODE_MAX_ATTEMPTS,
} from './phone-verify.service';
import { TelegramBot } from './telegram-bot';
import { PrismaService } from '../prisma/prisma.service';

function build(
  opts: {
    configured?: boolean;
    link?: any;
    takenBy?: any;
    counted?: number;
  } = {},
) {
  const prisma = {
    $transaction: jest.fn().mockResolvedValue([]),
    telegramPhoneLink: {
      deleteMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(opts.link ?? null),
      findFirst: jest.fn().mockResolvedValue(opts.link ?? null),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: opts.counted ?? 1 }),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue(opts.takenBy ?? null),
      update: jest.fn(),
    },
  };
  const bot = {
    isConfigured: () => opts.configured ?? true,
    username: 'TeamCoachBot',
    sendMessage: jest.fn().mockResolvedValue(undefined),
  };
  const service = new PhoneVerifyService(
    prisma as unknown as PrismaService,
    bot as unknown as TelegramBot,
  );
  return { service, prisma, bot };
}

const future = () => new Date(Date.now() + 60_000);
const CHAT = 555;
const sha = (token: string, code: string) =>
  createHash('sha256').update(`${token}:${code}`).digest('hex');

const contactMsg = (phone_number: string, user_id = 42) => ({
  message: {
    chat: { id: CHAT },
    from: { id: 42 },
    contact: { phone_number, user_id },
  },
});

describe('PhoneVerifyService (Telegram + code)', () => {
  describe('startTelegramLink', () => {
    it('refuses to start when the bot is not configured', async () => {
      const { service } = build({ configured: false });
      await expect(
        service.startTelegramLink('u1', '9876543210'),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('rejects an implausible number', async () => {
      const { service } = build();
      await expect(service.startTelegramLink('u1', '12345')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a number already used by another account', async () => {
      const { service, prisma } = build({ takenBy: { id: 'other' } });
      await expect(
        service.startTelegramLink('u1', '98765 43210'),
      ).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('stores the typed (normalised) number on a single live link and returns a deep link, without touching the user', async () => {
      const { service, prisma } = build();
      const res = await service.startTelegramLink('u1', '+91 98765 43210');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.telegramPhoneLink.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'u1', phone: '9876543210' }),
      });
      expect(res.deepLink).toMatch(
        /^https:\/\/t\.me\/TeamCoachBot\?start=[A-Za-z0-9_-]{32}$/,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('bot webhook', () => {
    it('/start with a valid token records the chat and asks for the contact', async () => {
      const link = {
        token: 'tok',
        userId: 'u1',
        usedAt: null,
        expiresAt: future(),
      };
      const { service, prisma, bot } = build({ link });
      await service.handleUpdate({
        message: { chat: { id: CHAT }, from: { id: 1 }, text: '/start tok' },
      });
      expect(prisma.telegramPhoneLink.update).toHaveBeenCalledWith({
        where: { token: 'tok' },
        data: { telegramChatId: BigInt(CHAT) },
      });
      expect(bot.sendMessage).toHaveBeenCalledWith(
        BigInt(CHAT),
        expect.any(String),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            keyboard: [[expect.objectContaining({ request_contact: true })]],
          }),
        }),
      );
    });

    it('/start with an expired token does not link anything', async () => {
      const expired = {
        token: 'tok',
        userId: 'u1',
        usedAt: null,
        expiresAt: new Date(0),
      };
      const { service, prisma, bot } = build({ link: expired });
      await service.handleUpdate({
        message: { chat: { id: CHAT }, from: { id: 1 }, text: '/start tok' },
      });
      expect(prisma.telegramPhoneLink.update).not.toHaveBeenCalled();
      expect(bot.sendMessage.mock.calls[0][1]).toMatch(/expired/i);
    });

    it('a matching contact sends a 6-digit code and stores only its hash — the phone is not verified yet', async () => {
      const link = {
        token: 'tok',
        userId: 'u1',
        phone: '9876543210',
        usedAt: null,
        expiresAt: future(),
      };
      const { service, prisma, bot } = build({ link });
      await service.handleUpdate(contactMsg('919876543210'));

      const sent: string = bot.sendMessage.mock.calls[0][1];
      const code = sent.match(/\b(\d{6})\b/)?.[1];
      expect(code).toBeDefined();
      expect(prisma.telegramPhoneLink.update).toHaveBeenCalledWith({
        where: { token: 'tok' },
        data: expect.objectContaining({
          codeHash: sha('tok', code!),
          codeExpiresAt: expect.any(Date),
          attempts: 0,
        }),
      });
      expect(
        JSON.stringify(prisma.telegramPhoneLink.update.mock.calls),
      ).not.toContain(`"${code}"`);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('a contact that differs from the typed number gets no code', async () => {
      const link = {
        token: 'tok',
        userId: 'u1',
        phone: '9000000000',
        usedAt: null,
        expiresAt: future(),
      };
      const { service, prisma, bot } = build({ link });
      await service.handleUpdate(contactMsg('919876543210'));
      expect(prisma.telegramPhoneLink.update).not.toHaveBeenCalled();
      expect(bot.sendMessage.mock.calls[0][1]).toMatch(
        /different from the number/i,
      );
    });

    it('rejects a forwarded contact that belongs to someone else', async () => {
      const link = {
        token: 'tok',
        userId: 'u1',
        phone: '9876543210',
        usedAt: null,
        expiresAt: future(),
      };
      const { service, prisma, bot } = build({ link });
      await service.handleUpdate(contactMsg('919876543210', 99));
      expect(prisma.telegramPhoneLink.update).not.toHaveBeenCalled();
      expect(bot.sendMessage.mock.calls[0][1]).toMatch(/your own number/i);
    });

    it('a contact with no pending link is ignored politely', async () => {
      const { service, prisma, bot } = build({ link: null });
      await service.handleUpdate(contactMsg('919876543210'));
      expect(prisma.telegramPhoneLink.update).not.toHaveBeenCalled();
      expect(bot.sendMessage.mock.calls[0][1]).toMatch(
        /No pending verification/,
      );
    });

    it('refuses a number already linked to another account', async () => {
      const link = {
        token: 'tok',
        userId: 'u1',
        phone: '9876543210',
        usedAt: null,
        expiresAt: future(),
      };
      const { service, prisma, bot } = build({
        link,
        takenBy: { id: 'someone-else' },
      });
      await service.handleUpdate(contactMsg('919876543210'));
      expect(prisma.telegramPhoneLink.update).not.toHaveBeenCalled();
      expect(bot.sendMessage.mock.calls[0][1]).toMatch(/already linked/i);
    });

    it('ignores unrelated messages', async () => {
      const { service, bot, prisma } = build();
      await service.handleUpdate({
        message: { chat: { id: CHAT }, text: 'hello' },
      });
      await service.handleUpdate({});
      expect(bot.sendMessage).not.toHaveBeenCalled();
      expect(prisma.telegramPhoneLink.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('confirmCode', () => {
    const live = (over: Record<string, unknown> = {}) => ({
      token: 'tok',
      userId: 'u1',
      phone: '9876543210',
      codeHash: sha('tok', '123456'),
      codeExpiresAt: future(),
      attempts: 0,
      ...over,
    });

    it('verifies the phone and marks the link used when the code is right', async () => {
      const { service, prisma } = build({ link: live() });
      await expect(service.confirmCode('u1', '123456')).resolves.toEqual({
        phone: '9876543210',
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { phone: '9876543210', phoneVerifiedAt: expect.any(Date) },
      });
      expect(prisma.telegramPhoneLink.update).toHaveBeenCalledWith({
        where: { token: 'tok' },
        data: { usedAt: expect.any(Date) },
      });
    });

    it('rejects a wrong code without verifying', async () => {
      const { service, prisma } = build({ link: live() });
      await expect(service.confirmCode('u1', '000000')).rejects.toThrow(
        /Incorrect code/,
      );
      expect(prisma.telegramPhoneLink.updateMany).toHaveBeenCalledWith({
        where: { token: 'tok', attempts: { lt: PHONE_CODE_MAX_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('stops after too many attempts, even if the code would have been right', async () => {
      const { service, prisma } = build({ link: live(), counted: 0 });
      await expect(service.confirmCode('u1', '123456')).rejects.toThrow(
        /Too many wrong codes/,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an expired code', async () => {
      const { service, prisma } = build({
        link: live({ codeExpiresAt: new Date(0) }),
      });
      await expect(service.confirmCode('u1', '123456')).rejects.toThrow(
        /expired/,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('asks to start again when no code was ever sent', async () => {
      const { service } = build({ link: null });
      await expect(service.confirmCode('u1', '123456')).rejects.toThrow(
        /No code is waiting/,
      );
    });

    it('refuses if someone else claimed the number in the meantime', async () => {
      const { service, prisma } = build({
        link: live(),
        takenBy: { id: 'other' },
      });
      await expect(service.confirmCode('u1', '123456')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
