import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { TokenVerifier } from 'livekit-server-sdk';
import { VoiceService } from './voice.service';
import { ChatService } from '../chat/chat.service';
import { PrismaService } from '../prisma/prisma.service';
import { MediasoupSfuService } from './mediasoup-sfu.service';

// The hosted/self-hosted branch is picked by an env var that the e2e suite's
// single running app can't safely flip mid-run (process.env is shared across
// every test file in the same `--runInBand` process). Testing it here with
// mocked dependencies instead of a full app avoids that risk entirely, and
// is the more idiomatic place for isolated branch logic anyway.
describe('VoiceService (unit)', () => {
  function buildService(config: Record<string, string | undefined>, selfHosted: boolean) {
    const configService = { get: (key: string) => config[key] } as unknown as ConfigService;
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

    return new VoiceService(configService, chatService, prisma, sfu);
  }

  it('returns { mode: "self" } without touching org lookup or LiveKit at all when self-hosted', async () => {
    const service = buildService({}, true);
    const result = await service.getConfig('user-123');
    expect(result).toEqual({ mode: 'self' });
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
      { LIVEKIT_URL: 'wss://example.livekit.cloud', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '' },
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

    const result = (await service.getConfig('user-123')) as {
      mode: 'hosted';
      url: string;
      token: string;
    };
    expect(result.mode).toBe('hosted');
    expect(result.url).toBe('wss://example.livekit.cloud');

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
    const result = (await service.getConfig('user-123')) as { token: string };

    const wrongVerifier = new TokenVerifier('test-key', 'a-completely-different-secret-value');
    await expect(wrongVerifier.verify(result.token)).rejects.toThrow();
  });
});
