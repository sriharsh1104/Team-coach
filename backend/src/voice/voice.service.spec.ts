import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TokenVerifier } from 'livekit-server-sdk';
import { VoiceService } from './voice.service';
import { VoiceGateway } from './voice.gateway';
import { ChatService } from '../chat/chat.service';
import { PrismaService } from '../prisma/prisma.service';
import { MediasoupSfuService } from './mediasoup-sfu.service';
import { MembershipService } from '../membership/membership.service';

// The hosted/self-hosted branch is picked by an env var that the e2e suite's
// single running app can't safely flip mid-run (process.env is shared across
// every test file in the same `--runInBand` process). Testing it here with
// mocked dependencies instead of a full app avoids that risk entirely, and
// is the more idiomatic place for isolated branch logic anyway.
describe('VoiceService (unit)', () => {
  function mockGateway(
    occupants: Array<{
      id: string;
      name: string;
      avatarUrl: string | null;
    }> = [],
  ) {
    return {
      listOccupants: jest.fn().mockResolvedValue(occupants),
    } as unknown as VoiceGateway;
  }

  function buildService(
    config: Record<string, string | undefined>,
    selfHosted: boolean,
    gateway: VoiceGateway = mockGateway(),
  ) {
    const configService = {
      get: (key: string) => config[key],
    } as unknown as ConfigService;
    const chatService = {
      getOrgIdForUser: jest.fn().mockResolvedValue('org-123'),
    } as unknown as ChatService;
    const prisma = {
      user: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 'user-123', name: 'Alice' }),
      },
    } as unknown as PrismaService;
    const sfu = {
      isSelfHosted: () => selfHosted,
    } as unknown as MediasoupSfuService;

    const membership = {
      hasEditAccess: jest.fn().mockResolvedValue(false),
    } as unknown as MembershipService;

    return new VoiceService(
      configService,
      chatService,
      prisma,
      sfu,
      membership,
      gateway,
    );
  }

  it('returns { mode: "self" } without touching org lookup or LiveKit at all when self-hosted', async () => {
    const service = buildService({}, true);
    const result = await service.getConfig('user-123');
    expect(result).toEqual({ mode: 'self', max: 5, room: 'team' });
  });

  it('throws a clean ServiceUnavailableException when hosted but LiveKit is not configured', async () => {
    const service = buildService(
      { LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '' },
      false,
    );
    await expect(service.getConfig('user-123')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('throws the same clean error when only some LiveKit vars are set', async () => {
    const service = buildService(
      {
        LIVEKIT_URL: 'wss://example.livekit.cloud',
        LIVEKIT_API_KEY: '',
        LIVEKIT_API_SECRET: '',
      },
      false,
    );
    await expect(service.getConfig('user-123')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('generates a correctly-signed, correctly-scoped token when hosted and configured', async () => {
    const apiKey = 'test-key';
    const apiSecret = 'test-secret-at-least-32-characters-long';
    const service = buildService(
      {
        LIVEKIT_URL: 'wss://example.livekit.cloud',
        LIVEKIT_API_KEY: apiKey,
        LIVEKIT_API_SECRET: apiSecret,
      },
      false,
    );
    const lk = { createRoom: jest.fn().mockResolvedValue({ metadata: '' }) };
    jest
      .spyOn(
        service as unknown as { roomClient: () => unknown },
        'roomClient' as never,
      )
      .mockReturnValue(lk as never);

    const result = (await service.getConfig('user-123')) as {
      mode: 'hosted';
      url: string;
      token: string;
      max?: number;
    };
    expect(result.mode).toBe('hosted');
    expect(result.url).toBe('wss://example.livekit.cloud');
    expect(result.max).toBe(5);
    expect(lk.createRoom).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'org-123', maxParticipants: 5 }),
    );

    // Decode with the same secret — proves it's a real, validly-signed token,
    // not just a string that happens to look like one, and that the room is
    // the caller's actual org (never attacker-influenced).
    const verifier = new TokenVerifier(apiKey, apiSecret);
    const claims = await verifier.verify(result.token);
    expect(claims.sub).toBe('user-123');
    expect(claims.video).toEqual({
      roomJoin: true,
      room: 'org-123',
      canPublish: true,
      canSubscribe: true,
      canPublishSources: ['microphone', 'screen_share', 'screen_share_audio'],
    });
  });

  it('rejects a token signed with the wrong secret — proves verification is real, not rubber-stamped', async () => {
    const service = buildService(
      {
        LIVEKIT_URL: 'wss://example.livekit.cloud',
        LIVEKIT_API_KEY: 'test-key',
        LIVEKIT_API_SECRET: 'test-secret-at-least-32-characters-long',
      },
      false,
    );
    const lk = { createRoom: jest.fn().mockResolvedValue({ metadata: '' }) };
    jest
      .spyOn(
        service as unknown as { roomClient: () => unknown },
        'roomClient' as never,
      )
      .mockReturnValue(lk as never);
    const result = (await service.getConfig('user-123')) as { token: string };

    const wrongVerifier = new TokenVerifier(
      'test-key',
      'a-completely-different-secret-value',
    );
    await expect(wrongVerifier.verify(result.token)).rejects.toThrow();
  });

  it('self-hosted occupancy lists gateway sockets without joining', async () => {
    const gateway = mockGateway([
      { id: 'u2', name: 'Bob', avatarUrl: null },
      { id: 'u3', name: 'Cara', avatarUrl: 'https://cdn/c.png' },
    ]);
    const service = buildService({}, true, gateway);
    const result = await service.getOccupancy('user-123', 'team');
    expect(gateway.listOccupants).toHaveBeenCalledWith('org-123');
    expect(result).toEqual({
      room: 'team',
      max: 5,
      count: 2,
      participants: [
        { id: 'u2', name: 'Bob', avatarUrl: null },
        { id: 'u3', name: 'Cara', avatarUrl: 'https://cdn/c.png' },
      ],
    });
  });

  it('hosted occupancy maps LiveKit participants (empty room = empty list)', async () => {
    const service = buildService(
      {
        LIVEKIT_URL: 'wss://example.livekit.cloud',
        LIVEKIT_API_KEY: 'test-key',
        LIVEKIT_API_SECRET: 'test-secret-at-least-32-characters-long',
      },
      false,
    );
    const lk = {
      listParticipants: jest.fn().mockResolvedValue([
        {
          identity: 'u2',
          name: 'Bob',
          metadata: JSON.stringify({ avatarUrl: 'https://cdn/b.png' }),
        },
      ]),
    };
    jest
      .spyOn(
        service as unknown as { roomClient: () => unknown },
        'roomClient' as never,
      )
      .mockReturnValue(lk as never);

    const result = await service.getOccupancy('user-123', 'team');
    expect(lk.listParticipants).toHaveBeenCalledWith('org-123');
    expect(result).toEqual({
      room: 'team',
      max: 5,
      count: 1,
      participants: [{ id: 'u2', name: 'Bob', avatarUrl: 'https://cdn/b.png' }],
    });

    lk.listParticipants.mockRejectedValue(new Error('room does not exist'));
    const empty = await service.getOccupancy('user-123', 'team');
    expect(empty.count).toBe(0);
    expect(empty.participants).toEqual([]);
  });
});

describe('VoiceService hosted guild voice (unit)', () => {
  const config: Record<string, string> = {
    LIVEKIT_URL: 'wss://example.livekit.cloud',
    LIVEKIT_API_KEY: 'test-key',
    LIVEKIT_API_SECRET: 'test-secret-at-least-32-characters-long',
  };

  function build(opts: { canModerate: boolean; roomMetadata?: string }) {
    const prisma = {
      user: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 'u1', name: 'Alice' }),
      },
      membership: {
        findFirst: jest.fn().mockResolvedValue({
          orgId: 'org-1',
          isOwner: opts.canModerate,
          role: 'PLAYER',
        }),
      },
      guildMembership: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new VoiceService(
      { get: (k: string) => config[k] } as unknown as ConfigService,
      {
        getOrgIdForUser: jest.fn().mockResolvedValue('org-1'),
      } as unknown as ChatService,
      prisma,
      { isSelfHosted: () => false } as unknown as MediasoupSfuService,
      {
        hasEditAccess: jest.fn().mockResolvedValue(opts.canModerate),
      } as unknown as MembershipService,
      {
        listOccupants: jest.fn().mockResolvedValue([]),
      } as unknown as VoiceGateway,
    );
    const lk = {
      createRoom: jest
        .fn()
        .mockResolvedValue({ metadata: opts.roomMetadata ?? '' }),
      listRooms: jest
        .fn()
        .mockResolvedValue([{ metadata: opts.roomMetadata ?? '' }]),
      updateRoomMetadata: jest.fn().mockResolvedValue({}),
      listParticipants: jest.fn().mockResolvedValue([
        {
          identity: 'host',
          attributes: { mod: '1' },
          permission: { canPublish: true },
        },
        {
          identity: 'p2',
          attributes: { mod: '0' },
          permission: { canPublish: true },
        },
      ]),
      getParticipant: jest
        .fn()
        .mockImplementation(async (_r: string, id: string) => ({
          identity: id,
          attributes: { mod: id === 'host' ? '1' : '0' },
        })),
      updateParticipant: jest.fn().mockResolvedValue({}),
      removeParticipant: jest.fn().mockResolvedValue(undefined),
    };
    jest
      .spyOn(
        service as unknown as { roomClient: () => unknown },
        'roomClient' as never,
      )
      .mockReturnValue(lk as never);
    return { service, lk };
  }

  it('guild token: own-org guild room, 50 cap, host flag', async () => {
    const { service, lk } = build({ canModerate: true });
    const res = (await service.getConfig('u1', 'guild')) as {
      token: string;
      canModerate: boolean;
      room: string;
    };
    expect(lk.createRoom).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'guild:org-1', maxParticipants: 50 }),
    );
    expect(res.canModerate).toBe(true);
    const claims = await new TokenVerifier(
      config.LIVEKIT_API_KEY,
      config.LIVEKIT_API_SECRET,
    ).verify(res.token);
    expect(claims.video?.room).toBe('guild:org-1');
    expect(claims.video?.canPublish).toBe(true);
    expect(claims.video?.canPublishSources).toEqual(
      expect.arrayContaining(['microphone', 'screen_share', 'screen_share_audio']),
    );
  });

  it('a muted user cannot rejoin with publish rights', async () => {
    const { service } = build({
      canModerate: false,
      roomMetadata: JSON.stringify({
        listenOnly: false,
        muted: ['u1'],
        speakers: [],
      }),
    });
    const res = (await service.getConfig('u1', 'guild')) as { token: string };
    const claims = await new TokenVerifier(
      config.LIVEKIT_API_KEY,
      config.LIVEKIT_API_SECRET,
    ).verify(res.token);
    expect(claims.video?.canPublish).toBe(false);
  });

  it('non-hosts cannot moderate or kick', async () => {
    const { service } = build({ canModerate: false });
    await expect(
      service.moderate('u1', { room: 'guild', action: 'muteAll' }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.moderate('u1', { room: 'guild', action: 'kick', userId: 'p2' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('mute all writes state and revokes publish only for non-hosts', async () => {
    const { service, lk } = build({ canModerate: true });
    await service.moderate('u1', { room: 'guild', action: 'muteAll' });
    expect(lk.updateRoomMetadata).toHaveBeenCalledWith(
      'guild:org-1',
      JSON.stringify({ listenOnly: true, muted: [], speakers: [] }),
    );
    expect(lk.updateParticipant).toHaveBeenCalledTimes(1);
    expect(lk.updateParticipant).toHaveBeenCalledWith(
      'guild:org-1',
      'p2',
      undefined,
      expect.objectContaining({ canPublish: false }),
    );
  });

  it('hosts cannot be muted; kick is enforced server-side', async () => {
    const { service, lk } = build({ canModerate: true });
    await expect(
      service.moderate('u1', { room: 'guild', action: 'mute', userId: 'host' }),
    ).rejects.toThrow(BadRequestException);
    await service.moderate('u1', {
      room: 'guild',
      action: 'kick',
      userId: 'p2',
    });
    expect(lk.removeParticipant).toHaveBeenCalledWith('guild:org-1', 'p2');
    await expect(
      service.moderate('u1', { room: 'guild', action: 'kick', userId: 'u1' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('team room only supports kick (no mute controls)', async () => {
    const { service } = build({ canModerate: true });
    await expect(
      service.moderate('u1', { room: 'team', action: 'muteAll' }),
    ).rejects.toThrow(ForbiddenException);
  });
});
