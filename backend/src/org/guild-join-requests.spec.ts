import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  GuildJoinRequestStatus,
  GuildRole,
  MembershipRole,
} from '@prisma/client';
import { OrgService } from './org.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { PushNotificationService } from '../common/push-notification.service';

type Seat = {
  orgId: string;
  isOwner?: boolean;
  role?: MembershipRole | GuildRole;
} | null;

describe('OrgService guild join requests', () => {
  function build(opts: {
    /** Seat of the user making the call (requester or decider). */
    callerRoster?: Seat;
    callerGuild?: Seat;
    /** Seat of the person the request is about, when deciding. */
    targetGuild?: { orgId: string } | null;
    request?: {
      id: string;
      userId: string;
      orgId: string;
      status: GuildJoinRequestStatus;
      org: { name: string };
    } | null;
    existingRequest?: { id: string; status: GuildJoinRequestStatus } | null;
  }) {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const update = jest.fn().mockResolvedValue({});
    const upsert = jest.fn().mockResolvedValue({});
    const create = jest.fn().mockResolvedValue({});
    const send = jest.fn().mockResolvedValue(undefined);

    // membership/guildMembership.findFirst is used both for "who is calling"
    // and "is the target already seated"; the queries are distinguished by
    // whether they filter on a userId that is not the caller.
    const prisma = {
      membership: {
        findFirst: jest.fn().mockResolvedValue(opts.callerRoster ?? null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      guildMembership: {
        findFirst: jest.fn((args: { where: { userId?: string } }) =>
          Promise.resolve(
            args?.where?.userId === 'target'
              ? (opts.targetGuild ?? null)
              : (opts.callerGuild ?? null),
          ),
        ),
        findMany: jest.fn().mockResolvedValue([]),
        create,
      },
      guildJoinRequest: {
        findUnique: jest
          .fn()
          .mockResolvedValue(opts.request ?? opts.existingRequest ?? null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert,
        update,
        updateMany,
        delete: jest.fn().mockResolvedValue({}),
      },
      org: {
        findUnique: jest.fn().mockResolvedValue({ id: 'o1', name: 'Sacred' }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ expoPushToken: 'tok' }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ name: 'Bob', inGameName: 'Bobby' }),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    } as unknown as PrismaService;

    const service = new OrgService(
      prisma,
      {
        publish: jest.fn(),
        publishToUser: jest.fn(),
      } as unknown as RealtimeService,
      {
        tokensFor: (raw: string | null) => (raw ? [`expo:${raw}`] : []),
        send,
      } as unknown as PushNotificationService,
      { buildDeliveryUrl: jest.fn().mockReturnValue(null) } as any,
    );
    return { service, prisma, upsert, update, updateMany, create, send };
  }

  describe('requesting', () => {
    it('records a pending request and pushes the org leadership', async () => {
      const { service, upsert, send } = build({});
      const res = await service.requestGuildJoin('u1', 'o1');

      expect(res.status).toBe(GuildJoinRequestStatus.PENDING);
      expect(upsert).toHaveBeenCalled();
      expect(send).toHaveBeenCalled();
    });

    it('is idempotent — tapping again does not re-notify', async () => {
      const { service, upsert, send } = build({
        existingRequest: { id: 'r1', status: GuildJoinRequestStatus.PENDING },
      });
      const res = await service.requestGuildJoin('u1', 'o1');

      expect(res.status).toBe(GuildJoinRequestStatus.PENDING);
      expect(upsert).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });

    it('reopens a rejected request instead of stacking a second row', async () => {
      const { service, upsert } = build({
        existingRequest: { id: 'r1', status: GuildJoinRequestStatus.REJECTED },
      });
      await service.requestGuildJoin('u1', 'o1');
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            status: GuildJoinRequestStatus.PENDING,
          }),
        }),
      );
    });

    it('refuses while the user still has a guild seat', async () => {
      const { service } = build({ callerGuild: { orgId: 'other' } });
      await expect(service.requestGuildJoin('u1', 'o1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('deciding', () => {
    const pending = {
      id: 'r1',
      userId: 'target',
      orgId: 'o1',
      status: GuildJoinRequestStatus.PENDING,
      org: { name: 'Sacred' },
    };

    it('a plain member cannot accept or reject', async () => {
      const { service } = build({
        request: pending,
        callerGuild: { orgId: 'o1', role: GuildRole.MEMBER },
        callerRoster: null,
      });
      await expect(
        service.decideGuildJoinRequest('u1', 'r1', true),
      ).rejects.toThrow(ForbiddenException);
    });

    it('accepting seats them and withdraws their other requests', async () => {
      const { service, prisma, send } = build({
        request: pending,
        callerRoster: { orgId: 'o1', isOwner: true },
        targetGuild: null,
      });
      const res = await service.decideGuildJoinRequest('owner', 'r1', true);

      expect(res.status).toBe(GuildJoinRequestStatus.ACCEPTED);
      // Seat + decision + withdrawal must land together.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const ops = (prisma.$transaction as jest.Mock).mock.calls[0][0];
      expect(ops).toHaveLength(3);
      expect(send).toHaveBeenCalled();
    });

    it('rejecting tells the requester and seats nobody', async () => {
      const { service, prisma, update, send } = build({
        request: pending,
        callerRoster: { orgId: 'o1', isOwner: true },
      });
      const res = await service.decideGuildJoinRequest('owner', 'r1', false);

      expect(res.status).toBe(GuildJoinRequestStatus.REJECTED);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalled();
      expect(send).toHaveBeenCalled();
    });

    it('refuses a request that was already decided', async () => {
      const { service } = build({
        request: { ...pending, status: GuildJoinRequestStatus.REJECTED },
        callerRoster: { orgId: 'o1', isOwner: true },
      });
      await expect(
        service.decideGuildJoinRequest('owner', 'r1', true),
      ).rejects.toThrow(BadRequestException);
    });

    it('will not double-seat someone who joined elsewhere meanwhile', async () => {
      const { service, prisma } = build({
        request: pending,
        callerRoster: { orgId: 'o1', isOwner: true },
        targetGuild: { orgId: 'other-org' },
      });
      await expect(
        service.decideGuildJoinRequest('owner', 'r1', true),
      ).rejects.toThrow(/already joined another guild/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('joining with a code instead', () => {
    it('refuses a bare orgId — that is what a request is for', async () => {
      const { service } = build({});
      await expect(service.joinGuild('u1', { orgId: 'o1' })).rejects.toThrow(
        /needs the owner/,
      );
    });
  });
});
