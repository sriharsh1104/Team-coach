import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ForbiddenException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TokenVerifier } from 'livekit-server-sdk';
import { VoiceService } from './voice.service';
import { VoiceGateway } from './voice.gateway';
import { PushNotificationService } from '../common/push-notification.service';
import { ChatService } from '../chat/chat.service';
import { PrismaService } from '../prisma/prisma.service';
import { MediasoupSfuService } from './mediasoup-sfu.service';
import { MembershipService } from '../membership/membership.service';

/** Voice never pushes in these tests — invite() has its own suite. */
function stubPush() {
  return {
    tokensFor: () => [],
    send: jest.fn().mockResolvedValue(undefined),
  } as unknown as PushNotificationService;
}

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
      membership: {
        findFirst: jest.fn().mockResolvedValue({ isOwner: false }),
      },
      guildMembership: {
        findFirst: jest.fn().mockResolvedValue(null),
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
      stubPush(),
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
      roomCreate: true,
      room: 'org-123',
      canPublish: true,
      canSubscribe: true,
      canPublishSources: ['microphone', 'screen_share', 'screen_share_audio'],
    });
    expect(lk.createRoom).toHaveBeenCalledWith(
      expect.objectContaining({ emptyTimeout: 30 * 60 }),
    );
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

    const debugSpy = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);
    lk.listParticipants.mockRejectedValue(new Error('room does not exist'));
    const empty = await service.getOccupancy('user-123', 'team');
    expect(empty.count).toBe(0);
    expect(empty.participants).toEqual([]);
    // Expected empty lobby — do not spam Nest DEBUG every 10s from chat polls.
    expect(debugSpy).not.toHaveBeenCalled();
    debugSpy.mockRestore();
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
      stubPush(),
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
          attributes: { mod: '1', own: '1' },
          permission: { canPublish: true },
        },
        {
          identity: 'p2',
          attributes: { mod: '0', own: '0' },
          permission: { canPublish: true },
        },
      ]),
      getParticipant: jest
        .fn()
        .mockImplementation(async (_r: string, id: string) => ({
          identity: id,
          attributes: {
            mod: id === 'host' ? '1' : '0',
            own: id === 'host' ? '1' : '0',
          },
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
      expect.arrayContaining([
        'microphone',
        'screen_share',
        'screen_share_audio',
      ]),
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

  it('mute all writes state and revokes publish for everyone but the owner', async () => {
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

describe('VoiceService "ping to join" (unit)', () => {
  const ME = 'me';

  function build(opts: {
    occupants?: { id: string; name: string; avatarUrl: string | null }[];
    orgMemberIds?: string[];
    pushTokensByUser?: Record<string, string[]>;
  }) {
    const occupants = opts.occupants ?? [
      { id: ME, name: 'Me', avatarUrl: null },
    ];
    const send = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      user: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ name: 'Alice', inGameName: 'Al' }),
        findMany: jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
          Promise.resolve(
            where.id.in.map((id) => ({ id, expoPushToken: `tok:${id}` })),
          ),
        ),
      },
      membership: {
        findFirst: jest.fn().mockResolvedValue({ isOwner: false }),
        findMany: jest.fn(
          ({ where }: { where: { userId: { in: string[] } } }) =>
            Promise.resolve(
              where.userId.in
                .filter((id) =>
                  (opts.orgMemberIds ?? where.userId.in).includes(id),
                )
                .map((userId) => ({ userId })),
            ),
        ),
      },
    } as unknown as PrismaService;

    const push = {
      tokensFor: (raw: string) => {
        const userId = String(raw).replace('tok:', '');
        return opts.pushTokensByUser
          ? (opts.pushTokensByUser[userId] ?? [])
          : [`expo:${userId}`];
      },
      send,
    } as unknown as PushNotificationService;

    const service = new VoiceService(
      { get: () => undefined } as unknown as ConfigService,
      {
        getOrgIdForUser: jest.fn().mockResolvedValue('org-1'),
      } as unknown as ChatService,
      prisma,
      { isSelfHosted: () => true } as unknown as MediasoupSfuService,
      {
        hasEditAccess: jest.fn().mockResolvedValue(false),
      } as unknown as MembershipService,
      {
        listOccupants: jest.fn().mockResolvedValue(occupants),
      } as unknown as VoiceGateway,
      push,
    );
    return { service, send };
  }

  it('pushes a "waiting in Team Voice" nudge to the named teammates', async () => {
    const { service, send } = build({});
    const result = await service.invite(ME, { userIds: ['bob', 'cara'] });

    expect(result).toEqual({ sent: 2, skipped: 0 });
    const messages = send.mock.calls[0][0] as {
      to: string;
      title: string;
      data: unknown;
    }[];
    expect(messages.map((m) => m.to).sort()).toEqual(['expo:bob', 'expo:cara']);
    expect(messages[0].title).toBe('Al is waiting in Team Voice');
    expect(messages[0].data).toMatchObject({
      type: 'voice_invite',
      voiceRoom: 'team',
    });
  });

  it('refuses when the caller is not in the voice room', async () => {
    const { service, send } = build({ occupants: [] });
    await expect(service.invite(ME, { userIds: ['bob'] })).rejects.toThrow(
      /Join the voice channel first/,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('skips people already in the call and the caller themselves', async () => {
    const { service, send } = build({
      occupants: [
        { id: ME, name: 'Me', avatarUrl: null },
        { id: 'bob', name: 'Bob', avatarUrl: null },
      ],
    });
    const result = await service.invite(ME, { userIds: ['bob', ME, 'cara'] });

    expect(result).toEqual({ sent: 1, skipped: 0 });
    const messages = send.mock.calls[0][0] as { to: string }[];
    expect(messages.map((m) => m.to)).toEqual(['expo:cara']);
  });

  it('never pings someone outside the caller’s org', async () => {
    const { service, send } = build({ orgMemberIds: ['bob'] });
    const result = await service.invite(ME, { userIds: ['bob', 'stranger'] });

    expect(result).toEqual({ sent: 1, skipped: 1 });
    const messages = send.mock.calls[0][0] as { to: string }[];
    expect(messages.map((m) => m.to)).toEqual(['expo:bob']);
  });

  it('holds a repeat ping of the same person behind the cooldown', async () => {
    const { service, send } = build({});
    await service.invite(ME, { userIds: ['bob'] });
    const second = await service.invite(ME, { userIds: ['bob'] });

    expect(second).toEqual({ sent: 0, skipped: 1 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not burn the cooldown on someone with no registered device', async () => {
    const { service } = build({ pushTokensByUser: { bob: [] } });
    const first = await service.invite(ME, { userIds: ['bob'] });
    expect(first).toEqual({ sent: 0, skipped: 1 });

    // Bob installs the app; the very next ping must get through.
    const { service: service2, send } = build({});
    await service2.invite(ME, { userIds: ['bob'] });
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('VoiceService 1-on-1 voice', () => {
  const ME = 'me';
  const PEER = 'peer';

  /** Keep createRoom off the network — same seam the other suites use. */
  function stubLiveKit(service: VoiceService) {
    const lk = { createRoom: jest.fn().mockResolvedValue({ metadata: '' }) };
    jest
      .spyOn(
        service as unknown as { roomClient: () => unknown },
        'roomClient' as never,
      )
      .mockReturnValue(lk as never);
    return lk;
  }

  /** Default guild — tests that care about the guild rule override it. */
  const GUILD = 'guild-1';

  /**
   * `flags` is userId → has the permission. `guilds` is userId → which guild
   * they are in (undefined entry = that default guild, null = no guild), so
   * a test only has to say the part it is actually about.
   */
  function build(
    flags: Record<string, boolean>,
    guilds: Record<string, string | null> = {},
  ) {
    const guildOf = (id: string) =>
      id in guilds ? guilds[id] : GUILD;
    const guildRows = (id: string) => {
      const orgId = guildOf(id);
      return orgId ? [{ orgId }] : [];
    };

    const prisma = {
      user: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(
            where.id in flags
              ? {
                  canDirectVoice: flags[where.id],
                  name: where.id,
                  guildMemberships: guildRows(where.id),
                }
              : null,
          ),
        ),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: ME, name: 'Me', avatarUrl: null }),
        // Mirrors the real query: other holders, in the caller's guild.
        findMany: jest.fn(() =>
          Promise.resolve(
            Object.entries(flags)
              .filter(
                ([id, on]) =>
                  on && id !== ME && guildOf(id) === guildOf(ME),
              )
              .map(([id]) => ({
                id,
                name: id,
                inGameName: null,
                avatarUrl: null,
              })),
          ),
        ),
      },
    } as unknown as PrismaService;

    return new VoiceService(
      {
        get: (k: string) =>
          ({
            LIVEKIT_URL: 'wss://lk',
            LIVEKIT_API_KEY: 'key',
            LIVEKIT_API_SECRET: 'secret-secret-secret-secret',
          })[k],
      } as unknown as ConfigService,
      { getOrgIdForUser: jest.fn() } as unknown as ChatService,
      prisma,
      { isSelfHosted: () => false } as unknown as MediasoupSfuService,
      { hasEditAccess: jest.fn() } as unknown as MembershipService,
      { listOccupants: jest.fn() } as unknown as VoiceGateway,
      stubPush(),
    );
  }

  /** Both sides must derive the SAME room, or they sit in two empty calls. */
  it('puts both sides in one room whichever of them asks', async () => {
    const a = build({ [ME]: true, [PEER]: true });
    const b = build({ [ME]: true, [PEER]: true });
    const lkA = stubLiveKit(a);
    const lkB = stubLiveKit(b);

    await a.getConfig(ME, 'direct', PEER);
    await b.getConfig(PEER, 'direct', ME);

    const nameA = lkA.createRoom.mock.calls[0][0].name as string;
    const nameB = lkB.createRoom.mock.calls[0][0].name as string;
    expect(nameA).toBe(nameB);
    expect(nameA).toMatch(/^direct:/);
  });

  it('refuses when the caller lacks the permission', async () => {
    const service = build({ [ME]: false, [PEER]: true });
    await expect(service.getConfig(ME, 'direct', PEER)).rejects.toThrow(
      /not enabled for you/,
    );
  });

  // Granting to one person alone must open nothing.
  it('refuses when only the caller has it', async () => {
    const service = build({ [ME]: true, [PEER]: false });
    await expect(service.getConfig(ME, 'direct', PEER)).rejects.toThrow(
      /not available with them/,
    );
  });

  it('says the same thing for a peer that does not exist, so ids cannot be probed', async () => {
    const service = build({ [ME]: true });
    await expect(service.getConfig(ME, 'direct', 'ghost')).rejects.toThrow(
      /not available with them/,
    );
  });

  it('needs a peer, and refuses calling yourself', async () => {
    const service = build({ [ME]: true });
    await expect(service.getConfig(ME, 'direct')).rejects.toThrow(
      /Pick who you want to call/,
    );
    await expect(service.getConfig(ME, 'direct', ME)).rejects.toThrow(
      /cannot call yourself/,
    );
  });

  it('mints a 2-seat token when both sides have it', async () => {
    const service = build({ [ME]: true, [PEER]: true });
    const lk = stubLiveKit(service);
    const config = (await service.getConfig(ME, 'direct', PEER)) as {
      mode: string;
      max: number;
      room: string;
      token: string;
    };
    expect(config.mode).toBe('hosted');
    expect(config.max).toBe(2);
    expect(config.room).toBe('direct');
    expect(config.token).toBeTruthy();
    expect(lk.createRoom).toHaveBeenCalledWith(
      expect.objectContaining({ maxParticipants: 2 }),
    );
    const claims = await new TokenVerifier(
      'key',
      'secret-secret-secret-secret',
    ).verify(config.token);
    expect(claims.video?.canPublishSources).toEqual(
      expect.arrayContaining([
        'microphone',
        'screen_share',
        'screen_share_audio',
        'camera',
      ]),
    );
  });

  describe('peer list', () => {
    it('is empty and flagged off for someone without the permission', async () => {
      const service = build({ [ME]: false, [PEER]: true });
      await expect(service.listDirectVoicePeers(ME)).resolves.toEqual({
        enabled: false,
        needsGuild: false,
        peers: [],
      });
    });

    it('lists only other holders, never the caller', async () => {
      const service = build({ [ME]: true, [PEER]: true, other: false });
      const res = await service.listDirectVoicePeers(ME);
      expect(res.enabled).toBe(true);
      expect(res.peers.map((p) => p.id)).toEqual([PEER]);
    });

    it('leaves out a holder who is in a different guild', async () => {
      const service = build(
        { [ME]: true, [PEER]: true },
        { [PEER]: 'guild-2' },
      );
      const res = await service.listDirectVoicePeers(ME);
      expect(res.enabled).toBe(true);
      expect(res.peers).toEqual([]);
    });

    it('flags needsGuild for a holder who is in no guild yet', async () => {
      const service = build({ [ME]: true, [PEER]: true }, { [ME]: null });
      await expect(service.listDirectVoicePeers(ME)).resolves.toEqual({
        enabled: true,
        needsGuild: true,
        peers: [],
      });
    });
  });

  describe('both sides must be in the same guild', () => {
    it('refuses a peer in a different guild', async () => {
      const service = build(
        { [ME]: true, [PEER]: true },
        { [PEER]: 'guild-2' },
      );
      await expect(service.getConfig(ME, 'direct', PEER)).rejects.toThrow(
        /not available with them/,
      );
    });

    // Same wording as "no permission" and "no such account", so a caller
    // cannot use the error to learn who is in which guild.
    it('says the same thing whether the peer lacks the permission or the guild', async () => {
      const noPermission = build({ [ME]: true, [PEER]: false });
      const otherGuild = build(
        { [ME]: true, [PEER]: true },
        { [PEER]: 'guild-2' },
      );
      const messages = await Promise.all(
        [noPermission, otherGuild].map((s) =>
          s.getConfig(ME, 'direct', PEER).catch((e: Error) => e.message),
        ),
      );
      expect(messages[0]).toBe(messages[1]);
    });

    it('refuses when the caller is in no guild at all', async () => {
      const service = build({ [ME]: true, [PEER]: true }, { [ME]: null });
      await expect(service.getConfig(ME, 'direct', PEER)).rejects.toThrow(
        /Join a guild/,
      );
    });

    it('refuses when the peer is in no guild at all', async () => {
      const service = build({ [ME]: true, [PEER]: true }, { [PEER]: null });
      await expect(service.getConfig(ME, 'direct', PEER)).rejects.toThrow(
        /not available with them/,
      );
    });

    it('still connects a pair who share one guild', async () => {
      const service = build({ [ME]: true, [PEER]: true });
      stubLiveKit(service);
      const config = (await service.getConfig(ME, 'direct', PEER)) as {
        max: number;
        room: string;
      };
      expect(config).toMatchObject({ room: 'direct', max: 2 });
    });
  });
});
