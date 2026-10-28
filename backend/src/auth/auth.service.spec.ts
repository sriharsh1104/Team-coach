import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

// googleLogin's email_verified check and logout's tokenVersion bump don't
// need a real Postgres + Google OAuth round trip to verify — mocked deps
// (same manual-instantiation style as voice.service.spec.ts) keep this fast
// and lets us simulate payloads the real e2e suite can't reach a Google
// token for in the first place.
describe('AuthService (unit)', () => {
  let verifyIdTokenSpy: jest.SpyInstance;

  afterEach(() => {
    verifyIdTokenSpy?.mockRestore();
  });

  function buildService(prismaOverrides: Record<string, unknown> = {}) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
            id: 'new-user-id',
            tokenVersion: 0,
            ...data,
          })),
        update: jest
          .fn()
          .mockImplementation(
            ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
              id: where.id,
              tokenVersion: 0,
              ...data,
            }),
          ),
      },
      membership: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      ...prismaOverrides,
    } as unknown as PrismaService;

    const jwtService = {
      signAsync: jest.fn().mockResolvedValue('signed-jwt'),
    } as unknown as JwtService;

    const configService = {
      get: jest.fn().mockReturnValue('test-google-client-id'),
    } as unknown as ConfigService;

    const service = new AuthService(prisma, jwtService, configService);
    return { service, prisma, jwtService };
  }

  function mockGooglePayload(payload: Record<string, unknown> | null) {
    verifyIdTokenSpy = jest
      .spyOn(OAuth2Client.prototype, 'verifyIdToken')
      .mockResolvedValue({ getPayload: () => payload } as never);
  }

  const verifiedPayload = {
    sub: 'google-sub-123',
    email: 'player@example.com',
    email_verified: true,
    name: 'Player One',
    picture: 'https://example.com/pic.jpg',
  };

  describe('googleLogin', () => {
    it('SECURITY: rejects an unverified Google email instead of creating or linking an account', async () => {
      const { service, prisma } = buildService();
      mockGooglePayload({ ...verifiedPayload, email_verified: false });

      await expect(service.googleLogin({ idToken: 'fake' })).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects when email_verified is missing from the payload entirely', async () => {
      const { service, prisma } = buildService();
      const { email_verified: _unused, ...withoutVerified } = verifiedPayload;
      mockGooglePayload(withoutVerified);

      await expect(service.googleLogin({ idToken: 'fake' })).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('creates a new user when the email is verified and no account exists yet', async () => {
      const { service, prisma } = buildService();
      mockGooglePayload(verifiedPayload);

      const result = await service.googleLogin({ idToken: 'fake' });

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'player@example.com',
            googleId: 'google-sub-123',
          }),
        }),
      );
      expect('accessToken' in result && result.accessToken).toBe('signed-jwt');
    });

    it('links googleId onto an existing password account with the same verified email, without creating a duplicate', async () => {
      const existingUser = { id: 'existing-id', email: 'player@example.com', tokenVersion: 0 };
      const { service, prisma } = buildService({
        user: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce(null) // lookup by googleId: no linked account yet
            .mockResolvedValueOnce(existingUser), // lookup by email: existing password account
          update: jest.fn().mockResolvedValue({ ...existingUser, googleId: 'google-sub-123' }),
          create: jest.fn(),
        },
      });
      mockGooglePayload(verifiedPayload);

      await service.googleLogin({ idToken: 'fake' });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'existing-id' },
        data: { googleId: 'google-sub-123' },
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('increments tokenVersion, invalidating every outstanding token for that user', async () => {
      const { service, prisma } = buildService();

      await service.logout('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { tokenVersion: { increment: 1 } },
      });
    });
  });

  describe('token issuance', () => {
    it("embeds the user's current tokenVersion in every signed access token", async () => {
      const { service, jwtService } = buildService({
        user: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({
            id: 'u1',
            email: 'a@b.com',
            name: 'A',
            avatarUrl: null,
            tokenVersion: 3,
          }),
        },
      });

      await service.signup({ email: 'a@b.com', password: 'password123', name: 'A' });

      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'u1', tokenVersion: 3 }),
      );
    });
  });
});
