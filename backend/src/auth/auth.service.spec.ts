import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';

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
      emailVerificationCode: {
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      membership: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      ...prismaOverrides,
    } as unknown as PrismaService;

    const jwtService = {
      signAsync: jest.fn().mockResolvedValue('signed-jwt'),
      verifyAsync: jest.fn(),
    } as unknown as JwtService;

    const configService = {
      get: jest.fn().mockReturnValue('test-google-client-id'),
    } as unknown as ConfigService;

    const mailerService = {
      sendSignupOtp: jest.fn().mockResolvedValue(undefined),
      sendGeneratedPassword: jest.fn().mockResolvedValue(undefined),
    } as unknown as MailerService;

    const service = new AuthService(prisma, jwtService, configService, mailerService);
    return { service, prisma, jwtService, mailerService };
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

    it('creates a new user when the email is verified and no account exists yet, with a generated password emailed to them', async () => {
      const { service, prisma, mailerService } = buildService();
      mockGooglePayload(verifiedPayload);

      const result = await service.googleLogin({ idToken: 'fake' });

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'player@example.com',
            googleId: 'google-sub-123',
            emailVerified: true,
            passwordHash: expect.any(String),
          }),
        }),
      );
      expect('accessToken' in result && result.accessToken).toBe('signed-jwt');
      expect(mailerService.sendGeneratedPassword).toHaveBeenCalledWith(
        'player@example.com',
        expect.any(String),
      );
      // The emailed password must be the plaintext, not the stored hash.
      const [, emailedPassword] = (mailerService.sendGeneratedPassword as jest.Mock).mock.calls[0];
      const createdData = (prisma.user.create as jest.Mock).mock.calls[0][0].data;
      expect(createdData.passwordHash).not.toBe(emailedPassword);
      await expect(
        bcrypt.compare(emailedPassword, createdData.passwordHash),
      ).resolves.toBe(true);
    });

    it('links googleId onto an existing password account with the same verified email, without creating a duplicate or generating a password', async () => {
      const existingUser = { id: 'existing-id', email: 'player@example.com', tokenVersion: 0 };
      const { service, prisma, mailerService } = buildService({
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
      expect(mailerService.sendGeneratedPassword).not.toHaveBeenCalled();
    });
  });

  describe('signup', () => {
    it('creates the user and returns an email-verification challenge instead of a session', async () => {
      const { service, prisma, mailerService } = buildService();

      const result = await service.signup({
        email: 'a@b.com',
        password: 'Password123!',
        name: 'A',
      });

      expect(prisma.user.create).toHaveBeenCalled();
      expect(result).toEqual({
        requiresEmailVerification: true,
        challengeToken: 'signed-jwt',
      });
      expect(mailerService.sendSignupOtp).toHaveBeenCalledWith(
        'a@b.com',
        expect.stringMatching(/^\d{6}$/),
      );
    });
  });

  describe('verifyEmailSignup', () => {
    async function buildVerifiedChallenge({
      code = '123456',
      storedCode = '123456',
      attempts = 0,
      expiresAt = new Date(Date.now() + 60000),
    }: {
      code?: string;
      storedCode?: string;
      attempts?: number;
      expiresAt?: Date;
    } = {}) {
      const codeHash = await bcrypt.hash(storedCode, 4);
      const { service, prisma, jwtService } = buildService({
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'u1',
            email: 'a@b.com',
            tokenVersion: 3,
            emailVerified: false,
          }),
          update: jest.fn().mockResolvedValue({
            id: 'u1',
            email: 'a@b.com',
            name: 'A',
            avatarUrl: null,
            tokenVersion: 3,
            emailVerified: true,
          }),
        },
        emailVerificationCode: {
          findUnique: jest.fn().mockResolvedValue({
            userId: 'u1',
            codeHash,
            expiresAt,
            attempts,
          }),
          update: jest.fn().mockResolvedValue({}),
          delete: jest.fn().mockResolvedValue({}),
        },
      });
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
        sub: 'u1',
        purpose: 'email-verification',
      });
      return { service, prisma, jwtService, code };
    }

    it('logs the user in and embeds their tokenVersion in the access token on a correct code', async () => {
      const { service, prisma, jwtService } = await buildVerifiedChallenge();

      const result = await service.verifyEmailSignup({
        challengeToken: 'token',
        code: '123456',
      });

      expect(prisma.emailVerificationCode.delete).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { emailVerified: true },
      });
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'u1', tokenVersion: 3 }),
      );
      expect('accessToken' in result && result.accessToken).toBe('signed-jwt');
    });

    it('rejects an incorrect code and increments the attempt counter', async () => {
      const { service, prisma } = await buildVerifiedChallenge({ storedCode: '654321' });

      await expect(
        service.verifyEmailSignup({ challengeToken: 'token', code: '123456' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.emailVerificationCode.update).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: { attempts: { increment: 1 } },
      });
    });

    it('rejects an expired code', async () => {
      const { service } = await buildVerifiedChallenge({
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.verifyEmailSignup({ challengeToken: 'token', code: '123456' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('deletes the code and refuses further attempts once the attempt cap is hit', async () => {
      const { service, prisma } = await buildVerifiedChallenge({ attempts: 5 });

      await expect(
        service.verifyEmailSignup({ challengeToken: 'token', code: '123456' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.emailVerificationCode.delete).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
    });
  });

  describe('resendEmailVerification', () => {
    it('issues and emails a fresh code for an unverified user', async () => {
      const { service, prisma, jwtService, mailerService } = buildService({
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'u1',
            email: 'a@b.com',
            emailVerified: false,
          }),
        },
      });
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
        sub: 'u1',
        purpose: 'email-verification',
      });

      const result = await service.resendEmailVerification({ challengeToken: 'token' });

      expect(result).toEqual({ success: true });
      expect(prisma.emailVerificationCode.upsert).toHaveBeenCalled();
      expect(mailerService.sendSignupOtp).toHaveBeenCalledWith(
        'a@b.com',
        expect.stringMatching(/^\d{6}$/),
      );
    });

    it('rejects resending for an already-verified account', async () => {
      const { service, jwtService, mailerService } = buildService({
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'u1',
            email: 'a@b.com',
            emailVerified: true,
          }),
        },
      });
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
        sub: 'u1',
        purpose: 'email-verification',
      });

      await expect(
        service.resendEmailVerification({ challengeToken: 'token' }),
      ).rejects.toThrow(BadRequestException);
      expect(mailerService.sendSignupOtp).not.toHaveBeenCalled();
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
});
