import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { OrgService } from './org.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { PushNotificationService } from '../common/push-notification.service';

describe('OrgService leave + browse guilds', () => {
  function build(opts: {
    guild?: {
      id: string;
      orgId: string;
      org: { id: string; name: string };
    } | null;
    roster?: {
      id: string;
      orgId: string;
      isOwner: boolean;
      role: MembershipRole;
    } | null;
    orgs?: Array<{
      id: string;
      name: string;
      createdAt: Date;
      _count: { guildMemberships: number; memberships: number };
      chatChannelMetas?: { avatarUrl: string | null }[];
    }>;
  }) {
    const prisma = {
      guildMembership: {
        findFirst: jest.fn().mockResolvedValue(opts.guild ?? null),
        delete: jest.fn().mockResolvedValue({}),
      },
      membership: {
        findFirst: jest.fn().mockResolvedValue(opts.roster ?? null),
        delete: jest.fn().mockResolvedValue({}),
      },
      org: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            (opts.orgs ?? []).map((o) => ({ chatChannelMetas: [], ...o })),
          ),
      },
      guildJoinRequest: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          membership: { delete: jest.fn().mockResolvedValue({}) },
          guildMembership: { delete: jest.fn().mockResolvedValue({}) },
        }),
      ),
    } as unknown as PrismaService;

    const service = new OrgService(
      prisma,
      { publish: jest.fn() } as unknown as RealtimeService,
      {
        tokensFor: () => [],
        send: jest.fn().mockResolvedValue(undefined),
      } as unknown as PushNotificationService,
    );
    return { service, prisma };
  }

  it('browse lists guilds when the user has no seat', async () => {
    const { service, prisma } = build({
      guild: null,
      roster: null,
      orgs: [
        {
          id: 'o1',
          name: 'Sacred',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          _count: { guildMemberships: 10, memberships: 5 },
        },
      ],
    });
    const res = await service.browseGuilds('u1', 'sac');
    expect(prisma.org.findMany).toHaveBeenCalled();
    expect(res.guilds).toEqual([
      {
        id: 'o1',
        name: 'Sacred',
        logoUrl: null,
        memberCount: 10,
        rosterCount: 5,
        createdAt: '2026-01-01T00:00:00.000Z',
        requestStatus: null,
      },
    ]);
  });

  it('browse rejects users already in a guild', async () => {
    const { service } = build({
      guild: { id: 'g1', orgId: 'o1', org: { id: 'o1', name: 'Sacred' } },
      roster: null,
    });
    await expect(service.browseGuilds('u1')).rejects.toThrow(ConflictException);
  });

  it('leave drops guild + roster; owner blocked', async () => {
    const owner = build({
      guild: { id: 'g1', orgId: 'o1', org: { id: 'o1', name: 'Sacred' } },
      roster: {
        id: 'm1',
        orgId: 'o1',
        isOwner: true,
        role: MembershipRole.PLAYER,
      },
    });
    await expect(owner.service.leaveGuild('u1')).rejects.toThrow(
      ForbiddenException,
    );

    const member = build({
      guild: { id: 'g1', orgId: 'o1', org: { id: 'o1', name: 'Sacred' } },
      roster: {
        id: 'm1',
        orgId: 'o1',
        isOwner: false,
        role: MembershipRole.PLAYER,
      },
    });
    const left = await member.service.leaveGuild('u1');
    expect(left).toEqual({ left: true, orgId: 'o1', name: 'Sacred' });
    expect(member.prisma.$transaction).toHaveBeenCalled();
  });

  it('leave 404s when not in a guild', async () => {
    const { service } = build({ guild: null, roster: null });
    await expect(service.leaveGuild('u1')).rejects.toThrow(NotFoundException);
  });
});
