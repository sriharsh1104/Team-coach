import { ServiceUnavailableException } from '@nestjs/common';
import { PhoneVerifyService } from './phone-verify.service';
import { TelegramBot } from './telegram-bot';
import { PrismaService } from '../prisma/prisma.service';

function build(opts: { configured?: boolean; link?: any; takenBy?: any } = {}) {
  const prisma = {
    $transaction: jest.fn().mockResolvedValue([]),
    telegramPhoneLink: {
      deleteMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(opts.link ?? null),
      findFirst: jest.fn().mockResolvedValue(opts.link ?? null),
      update: jest.fn(),
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

describe('PhoneVerifyService (Telegram)', () => {
  it('refuses to start when the bot is not configured', async () => {
    const { service } = build({ configured: false });
    await expect(service.startTelegramLink('u1')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('creates a single live link and returns a t.me deep link, without touching the phone', async () => {
    const { service, prisma } = build();
    const res = await service.startTelegramLink('u1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(res.deepLink).toMatch(/^https:\/\/t\.me\/TeamCoachBot\?start=[A-Za-z0-9_-]{32}$/);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('/start with a valid token records the chat and asks for the contact', async () => {
    const link = { token: 'tok', userId: 'u1', usedAt: null, expiresAt: future() };
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
        reply_markup: expect.objectContaining({ keyboard: [[expect.objectContaining({ request_contact: true })]] }),
      }),
    );
  });

  it('/start with an expired or used token does not link anything', async () => {
    const expired = { token: 'tok', userId: 'u1', usedAt: null, expiresAt: new Date(0) };
    const { service, prisma, bot } = build({ link: expired });
    await service.handleUpdate({
      message: { chat: { id: CHAT }, from: { id: 1 }, text: '/start tok' },
    });
    expect(prisma.telegramPhoneLink.update).not.toHaveBeenCalled();
    expect(bot.sendMessage.mock.calls[0][1]).toMatch(/expired/i);
  });

  it('a shared contact verifies the phone for the linked user and marks the link used', async () => {
    const link = { token: 'tok', userId: 'u1', usedAt: null, expiresAt: future() };
    const { service, prisma, bot } = build({ link });
    await service.handleUpdate({
      message: {
        chat: { id: CHAT },
        from: { id: 42 },
        contact: { phone_number: '919876543210', user_id: 42 },
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: expect.objectContaining({ phone: '9876543210', phoneVerifiedAt: expect.any(Date) }),
      }),
    );
    expect(prisma.telegramPhoneLink.update).toHaveBeenCalledWith({
      where: { token: 'tok' },
      data: { usedAt: expect.any(Date) },
    });
    expect(bot.sendMessage.mock.calls[0][1]).toMatch(/verified/i);
  });

  it('rejects a forwarded contact that belongs to someone else', async () => {
    const link = { token: 'tok', userId: 'u1', usedAt: null, expiresAt: future() };
    const { service, prisma, bot } = build({ link });
    await service.handleUpdate({
      message: {
        chat: { id: CHAT },
        from: { id: 42 },
        contact: { phone_number: '919876543210', user_id: 99 },
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(bot.sendMessage.mock.calls[0][1]).toMatch(/your own number/i);
  });

  it('a contact with no pending link is ignored politely', async () => {
    const { service, prisma, bot } = build({ link: null });
    await service.handleUpdate({
      message: {
        chat: { id: CHAT },
        from: { id: 42 },
        contact: { phone_number: '919876543210', user_id: 42 },
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(bot.sendMessage.mock.calls[0][1]).toMatch(/No pending verification/);
  });

  it('refuses a number already linked to another account', async () => {
    const link = { token: 'tok', userId: 'u1', usedAt: null, expiresAt: future() };
    const { service, prisma, bot } = build({ link, takenBy: { id: 'someone-else' } });
    await service.handleUpdate({
      message: {
        chat: { id: CHAT },
        from: { id: 42 },
        contact: { phone_number: '919876543210', user_id: 42 },
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(bot.sendMessage.mock.calls[0][1]).toMatch(/already linked/i);
  });

  it('ignores unrelated messages', async () => {
    const { service, bot, prisma } = build();
    await service.handleUpdate({ message: { chat: { id: CHAT }, text: 'hello' } });
    await service.handleUpdate({});
    expect(bot.sendMessage).not.toHaveBeenCalled();
    expect(prisma.telegramPhoneLink.findFirst).not.toHaveBeenCalled();
  });
});
