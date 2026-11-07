import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { TwoFactorSetupDto } from './dto/two-factor-setup.dto';
import { TwoFactorEnableDto } from './dto/two-factor-enable.dto';
import { TwoFactorDisableDto } from './dto/two-factor-disable.dto';
import { TwoFactorVerifyDto } from './dto/two-factor-verify.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendEmailVerificationDto } from './dto/resend-email-verification.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { GuildRole, User } from '@prisma/client';
import { isProfileComplete } from '../users/users.service';
import {
  generateBackupCodes,
  generateQrCodeDataUrl,
  generateTwoFactorSecret,
  verifyTwoFactorCode,
} from './two-factor.util';
import { generateEmailOtp } from './email-verification.util';
import { PASSWORD_REGEX, generateRandomPassword } from './password.util';

const BCRYPT_SALT_ROUNDS = 12;
// Mobile app sessions stay logged in much longer than the configured
// JWT_EXPIRES_IN default (which is tuned for the web app) — nobody wants to
// re-enter their password every few days on their phone. Requested
// explicitly as a floor regardless of whatever JWT_EXPIRES_IN is set to.
const MOBILE_ACCESS_TOKEN_EXPIRES_IN = '30d';
// A 6-digit OTP is short-lived (10 min), single-use, and already capped at
// MAX_EMAIL_OTP_ATTEMPTS guesses — it doesn't need the same bcrypt cost as a
// long-lived account password.
const EMAIL_OTP_BCRYPT_SALT_ROUNDS = 6;
const EMAIL_OTP_TTL_MINUTES = 10;
const MAX_EMAIL_OTP_ATTEMPTS = 5;
// Per-IP throttling (auth.controller.ts) only caps one attacker IP — it does
// nothing against a few requests spread across different IPs, each well
// under that limit, all targeting the SAME inbox. This cooldown caps the
// actual thing that matters (how often one address gets emailed) regardless
// of how many IPs ask for it.
const EMAIL_OTP_RESEND_COOLDOWN_SECONDS = 30;

// Same lifecycle as the signup OTP above, kept as separate constants since
// the two gates are independent and could diverge later.
const PASSWORD_RESET_TTL_MINUTES = 10;
const MAX_PASSWORD_RESET_ATTEMPTS = 5;
const PASSWORD_RESET_RESEND_COOLDOWN_SECONDS = 30;

interface TwoFactorChallengePayload {
  sub: string;
  purpose: '2fa-challenge';
}

interface EmailVerificationChallengePayload {
  sub: string;
  purpose: 'email-verification';
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailerService: MailerService,
  ) {
    this.googleClient = new OAuth2Client(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
    );
  }

  /** Web + optional Android/iOS OAuth client IDs accepted as idToken audience. */
  private googleTokenAudiences(): string[] {
    const ids = [
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_ANDROID_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_IOS_CLIENT_ID'),
    ]
      .map((v) => v?.trim())
      .filter((v): v is string => Boolean(v));
    return [...new Set(ids)];
  }

  private async emailGeneratedPasswordWithRetry(
    email: string,
    password: string,
  ): Promise<void> {
    const attempts = 3;
    let lastError: unknown;
    for (let i = 1; i <= attempts; i += 1) {
      try {
        await this.mailerService.sendGeneratedPassword(email, password);
        return;
      } catch (err) {
        lastError = err;
        this.logger.warn(
          `Google password email attempt ${i}/${attempts} failed for ${email}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(String(lastError ?? 'password email failed'));
  }

  async signup(dto: SignupDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existing?.emailVerified) {
      throw new ConflictException('An account with this email already exists');
    }

    // An existing-but-unverified record is left exactly as it is — only a
    // fresh OTP gets sent. Nobody has proven they own this email yet at this
    // point (that's the whole purpose of the OTP about to be sent), so
    // accepting dto.password/dto.name here would let anyone who merely knows
    // the address overwrite the real signer-upper's password before they
    // ever get to verify. A resubmitted signup is treated the same as
    // resend-verification — whoever verifies gets in with the password set
    // on the *first* signup call, never a later one.
    const user =
      existing ??
      (await this.prisma.user.create({
        data: {
          email,
          passwordHash: await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS),
          name: dto.name,
        },
      }));

    // Signup never returns a session directly — the account isn't usable
    // until the emailed code is verified (see verifyEmailSignup). Letting a
    // failed send propagate here (rather than swallowing it) means the user
    // sees "signup failed, try again" instead of an account they have no way
    // to verify.
    await this.issueEmailVerificationCode(user.id, user.email);

    const payload: EmailVerificationChallengePayload = {
      sub: user.id,
      purpose: 'email-verification',
    };
    const challengeToken = await this.jwtService.signAsync(payload, {
      expiresIn: '15m',
    });
    return { requiresEmailVerification: true as const, challengeToken };
  }

  private async issueEmailVerificationCode(userId: string, email: string) {
    const existing = await this.prisma.emailVerificationCode.findUnique({
      where: { userId },
      select: { expiresAt: true },
    });
    if (existing) {
      // expiresAt is always (last-issued time + TTL) — back that out to get
      // when this address was last actually emailed, without needing a
      // dedicated column.
      const lastSentAt = existing.expiresAt.getTime() - EMAIL_OTP_TTL_MINUTES * 60 * 1000;
      const sinceLastSend = Date.now() - lastSentAt;
      if (sinceLastSend < EMAIL_OTP_RESEND_COOLDOWN_SECONDS * 1000) {
        throw new ConflictException(
          'A code was just sent to this email — please wait before requesting another.',
        );
      }
    }

    const code = generateEmailOtp();
    const codeHash = await bcrypt.hash(code, EMAIL_OTP_BCRYPT_SALT_ROUNDS);
    const expiresAt = new Date(Date.now() + EMAIL_OTP_TTL_MINUTES * 60 * 1000);

    await this.prisma.emailVerificationCode.upsert({
      where: { userId },
      create: { userId, codeHash, expiresAt },
      update: { codeHash, expiresAt, attempts: 0 },
    });

    await this.mailerService.sendSignupOtp(email, code);
  }

  private async resolveEmailVerificationChallenge(challengeToken: string) {
    let payload: EmailVerificationChallengePayload;
    try {
      payload =
        await this.jwtService.verifyAsync<EmailVerificationChallengePayload>(
          challengeToken,
        );
    } catch {
      throw new UnauthorizedException(
        'That verification link has expired — please sign up again',
      );
    }
    if (payload.purpose !== 'email-verification') {
      throw new UnauthorizedException('Invalid verification challenge');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException('Invalid verification challenge');
    }
    return user;
  }

  async verifyEmailSignup(dto: VerifyEmailDto, mobile = false) {
    const user = await this.resolveEmailVerificationChallenge(dto.challengeToken);
    if (user.emailVerified) {
      // Minting a session here with no code check at all — on the strength
      // of nothing but holding a (possibly stale, leaked, or long-expired-
      // looking but still-valid-for-15-minutes) challengeToken — would let
      // mere possession of that token log in indefinitely once the account
      // happens to be verified by any means. A legitimate double-submit
      // (two tabs, a retried request) just needs to be told to log in
      // normally instead, not silently handed a free session.
      throw new ConflictException('This email is already verified — please log in');
    }

    const record = await this.prisma.emailVerificationCode.findUnique({
      where: { userId: user.id },
    });
    if (!record || record.expiresAt < new Date()) {
      throw new UnauthorizedException(
        'That code has expired — request a new one',
      );
    }
    if (record.attempts >= MAX_EMAIL_OTP_ATTEMPTS) {
      await this.prisma.emailVerificationCode.delete({ where: { userId: user.id } });
      throw new UnauthorizedException(
        'Too many incorrect attempts — request a new code',
      );
    }

    const matches = await bcrypt.compare(dto.code, record.codeHash);
    if (!matches) {
      await this.prisma.emailVerificationCode.update({
        where: { userId: user.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Invalid code');
    }

    await this.prisma.emailVerificationCode.delete({ where: { userId: user.id } });
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });
    return this.buildAuthResponse(updated, mobile);
  }

  async resendEmailVerification(dto: ResendEmailVerificationDto) {
    const user = await this.resolveEmailVerificationChallenge(dto.challengeToken);
    if (user.emailVerified) {
      throw new BadRequestException('This email is already verified');
    }

    await this.issueEmailVerificationCode(user.id, user.email);
    return { success: true };
  }

  // Always returns the same generic response whether or not the email has
  // an account — leaking that distinction would let anyone enumerate
  // registered addresses one request at a time.
  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && user.passwordHash) {
      try {
        await this.issuePasswordResetCode(user.id, user.email);
      } catch (err) {
        // Don't let a mail/DB failure turn into a 500 for existing accounts
        // only — that would reveal which emails are registered. Log it so
        // the real cause is visible server-side.
        this.logger.error(
          `Password reset code could not be issued for user ${user.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return { success: true as const };
  }

  private async issuePasswordResetCode(userId: string, email: string) {
    const existing = await this.prisma.passwordResetCode.findUnique({
      where: { userId },
      select: { expiresAt: true },
    });
    if (existing) {
      // Same back-out-the-last-send trick as issueEmailVerificationCode.
      const lastSentAt =
        existing.expiresAt.getTime() - PASSWORD_RESET_TTL_MINUTES * 60 * 1000;
      const sinceLastSend = Date.now() - lastSentAt;
      if (sinceLastSend < PASSWORD_RESET_RESEND_COOLDOWN_SECONDS * 1000) {
        // forgotPassword's response must stay generic regardless — a
        // cooldown hit just means no second email goes out this time.
        return;
      }
    }

    const code = generateEmailOtp();
    const codeHash = await bcrypt.hash(code, EMAIL_OTP_BCRYPT_SALT_ROUNDS);
    const expiresAt = new Date(
      Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000,
    );

    await this.prisma.passwordResetCode.upsert({
      where: { userId },
      create: { userId, codeHash, expiresAt },
      update: { codeHash, expiresAt, attempts: 0 },
    });

    await this.mailerService.sendPasswordReset(email, code);
  }

  async resetPassword(dto: ResetPasswordDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid or expired code');
    }

    const record = await this.prisma.passwordResetCode.findUnique({
      where: { userId: user.id },
    });
    if (!record || record.expiresAt < new Date()) {
      throw new UnauthorizedException(
        'That code has expired — request a new one',
      );
    }
    if (record.attempts >= MAX_PASSWORD_RESET_ATTEMPTS) {
      await this.prisma.passwordResetCode.delete({ where: { userId: user.id } });
      throw new UnauthorizedException(
        'Too many incorrect attempts — request a new code',
      );
    }

    const matches = await bcrypt.compare(dto.code, record.codeHash);
    if (!matches) {
      await this.prisma.passwordResetCode.update({
        where: { userId: user.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Invalid code');
    }

    await this.prisma.passwordResetCode.delete({ where: { userId: user.id } });
    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);
    // Bumping tokenVersion kills every existing session — same reasoning as
    // changePassword: whoever reset the password is the only one who should
    // stay (or rather start fresh and have to) sign back in.
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });

    return { success: true as const };
  }

  async login(dto: LoginDto, mobile = false) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.emailVerified) {
      await this.issueEmailVerificationCode(user.id, user.email);
      const challengeToken = await this.jwtService.signAsync(
        { sub: user.id, purpose: 'email-verification' },
        { expiresIn: '15m' },
      );
      return { requiresEmailVerification: true as const, challengeToken };
    }

    return this.completeLoginOrChallenge(user, mobile);
  }

  async googleLogin(dto: GoogleLoginDto, mobile = false) {
    // Anything that goes wrong here — a malformed/garbage token, an expired
    // one, or even a transient failure fetching Google's verification certs —
    // is something the caller should see as "couldn't verify your Google
    // sign-in", not a raw 500 with internal error details leaked to the client.
    let payload: {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };
    try {
      const audiences = this.googleTokenAudiences();
      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.idToken,
        audience: audiences.length === 1 ? audiences[0] : audiences,
      });
      payload = ticket.getPayload() ?? {};
    } catch {
      throw new UnauthorizedException('Invalid Google token');
    }

    if (!payload.sub || !payload.email) {
      throw new UnauthorizedException('Invalid Google token');
    }
    const email = payload.email.trim().toLowerCase();

    // An unverified email on Google's side could belong to someone other
    // than the account holder — don't let it link to or create a Team Coach
    // account under that email.
    if (!payload.email_verified) {
      throw new UnauthorizedException('Your Google email is not verified');
    }

    let user = await this.prisma.user.findUnique({
      where: { googleId: payload.sub },
    });

    if (user) {
      // Returning Google user — password mail was already sent (or skipped) at
      // first signup. Re-login must never re-email a new password.
      this.logger.log(
        `Google login: existing googleId for ${email} — no password email`,
      );
    } else {
      const existingByEmail = await this.prisma.user.findUnique({
        where: { email },
      });

      if (existingByEmail) {
        user = await this.prisma.user.update({
          where: { id: existingByEmail.id },
          data: { googleId: payload.sub, emailVerified: true },
        });
        this.logger.log(
          `Google login: linked googleId onto existing email ${email} — no password email`,
        );
      } else {
        // Google already required a verified email above, so this account
        // doesn't need the signup OTP gate — emailVerified is true from
        // creation. It does still get a real password (randomly generated,
        // emailed once) so the user has a way to log in directly later, not
        // just through Google.
        const generatedPassword = generateRandomPassword();
        if (!PASSWORD_REGEX.test(generatedPassword)) {
          throw new UnauthorizedException('Could not create the account');
        }
        const passwordHash = await bcrypt.hash(
          generatedPassword,
          BCRYPT_SALT_ROUNDS,
        );
        user = await this.prisma.user.create({
          data: {
            email,
            googleId: payload.sub,
            name: payload.name ?? email,
            avatarUrl: payload.picture,
            passwordHash,
            emailVerified: true,
          },
        });
        this.logger.log(
          `Google login: created new user ${email} — sending password email`,
        );

        // Must succeed: if we keep the row after a failed send, every later
        // Google login hits "existing googleId" and never emails again — which
        // looks exactly like "login works, Resend shows nothing".
        try {
          await this.emailGeneratedPasswordWithRetry(
            user.email,
            generatedPassword,
          );
          this.logger.log(`Google login: password email accepted for ${email}`);
        } catch (err) {
          this.logger.error(
            `Failed to email generated password to ${user.email} — rolling back user`,
            err instanceof Error ? err.stack : String(err),
          );
          await this.prisma.user
            .delete({ where: { id: user.id } })
            .catch((deleteErr) => {
              this.logger.error(
                `Failed to roll back Google user ${user.id} after mail failure`,
                deleteErr instanceof Error ? deleteErr.stack : String(deleteErr),
              );
            });
          throw new ServiceUnavailableException(
            'Could not email your account password. Please try Google sign-in again.',
          );
        }

        const auth = await this.completeLoginOrChallenge(user, mobile);
        if ('accessToken' in auth) {
          return { ...auth, passwordEmailSent: true as const };
        }
        return auth;
      }
    }

    return this.completeLoginOrChallenge(user, mobile);
  }

  // 2FA is a property of the account, not the login method — applies the
  // same way whether credentials came from a password or Google.
  private async completeLoginOrChallenge(user: User, mobile = false) {
    if (!user.twoFactorEnabled) {
      return this.buildAuthResponse(user, mobile);
    }
    const payload: TwoFactorChallengePayload = {
      sub: user.id,
      purpose: '2fa-challenge',
    };
    const challengeToken = await this.jwtService.signAsync(payload, {
      expiresIn: '5m',
    });
    return { requiresTwoFactor: true as const, challengeToken };
  }

  async verifyTwoFactorLogin(dto: TwoFactorVerifyDto, mobile = false) {
    let payload: TwoFactorChallengePayload;
    try {
      payload = await this.jwtService.verifyAsync<TwoFactorChallengePayload>(
        dto.challengeToken,
      );
    } catch {
      throw new UnauthorizedException('That login challenge has expired — please log in again');
    }
    if (payload.purpose !== '2fa-challenge') {
      throw new UnauthorizedException('Invalid login challenge');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.twoFactorEnabled) {
      throw new UnauthorizedException('Invalid login challenge');
    }

    if (dto.code) {
      const result = user.twoFactorSecret
        ? verifyTwoFactorCode(user.twoFactorSecret, dto.code, user.lastTotpStep)
        : { valid: false };
      if (!result.valid) throw new UnauthorizedException('Invalid code');
      const updated = await this.prisma.user.update({
        where: { id: user.id },
        data: { lastTotpStep: result.step },
      });
      return this.buildAuthResponse(updated, mobile);
    }

    if (dto.backupCode) {
      const remaining: string[] = [];
      let matched = false;
      for (const hash of user.twoFactorBackupCodeHashes) {
        if (!matched && (await bcrypt.compare(dto.backupCode, hash))) {
          matched = true; // consume exactly one — one-time use
          continue;
        }
        remaining.push(hash);
      }
      if (!matched) throw new UnauthorizedException('Invalid backup code');
      const updated = await this.prisma.user.update({
        where: { id: user.id },
        data: { twoFactorBackupCodeHashes: remaining },
      });
      return this.buildAuthResponse(updated, mobile);
    }

    throw new BadRequestException('A code or backup code is required');
  }

  // Required before touching anything 2FA-related (setup/enable/disable) —
  // a valid access token alone must never be enough to plant, replace, or
  // remove a victim's 2FA, since a token can be stolen/leaked independently
  // of the account password.
  private async assertCurrentPassword(userId: string, password: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.passwordHash) {
      throw new BadRequestException('This account has no password set');
    }
    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Incorrect password');
    }
    return user;
  }

  /**
   * For Google-linked accounts whose signup password mail was missed (or lost).
   * Rotates the hash and emails the new plaintext — requires an active session
   * so only the signed-in owner can trigger it.
   */
  async emailGeneratedPassword(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (!user.googleId) {
      throw new BadRequestException(
        'Only Google-linked accounts can request a generated password email',
      );
    }
    const generatedPassword = generateRandomPassword();
    if (!PASSWORD_REGEX.test(generatedPassword)) {
      throw new ServiceUnavailableException('Could not generate a password');
    }
    // Email first so a failed send doesn't leave an unknown hash on the account.
    await this.emailGeneratedPasswordWithRetry(user.email, generatedPassword);
    const passwordHash = await bcrypt.hash(
      generatedPassword,
      BCRYPT_SALT_ROUNDS,
    );
    // Keep tokenVersion — recovery while already signed in via Google; bumping
    // would kick out the session that requested the email.
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    this.logger.log(`Emailed rotated password to ${user.email}`);
    return { success: true as const, email: user.email };
  }

  async setupTwoFactor(userId: string, dto: TwoFactorSetupDto) {
    const user = await this.assertCurrentPassword(userId, dto.password);
    const { base32: secret, otpauthUrl } = generateTwoFactorSecret(user.email);
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret },
    });
    const qrCodeDataUrl = await generateQrCodeDataUrl(otpauthUrl);
    return { secret, qrCodeDataUrl };
  }

  async enableTwoFactor(userId: string, dto: TwoFactorEnableDto) {
    const user = await this.assertCurrentPassword(userId, dto.password);
    if (!user.twoFactorSecret) {
      throw new BadRequestException('Call /auth/2fa/setup first');
    }
    const result = verifyTwoFactorCode(
      user.twoFactorSecret,
      dto.code,
      user.lastTotpStep,
    );
    if (!result.valid) {
      throw new UnauthorizedException('Invalid code');
    }

    const backupCodes = generateBackupCodes();
    const hashes = await Promise.all(
      backupCodes.map((code) => bcrypt.hash(code, BCRYPT_SALT_ROUNDS)),
    );
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorBackupCodeHashes: hashes,
        lastTotpStep: result.step,
      },
    });

    return { backupCodes };
  }

  async disableTwoFactor(userId: string, dto: TwoFactorDisableDto) {
    await this.assertCurrentPassword(userId, dto.password);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: null,
        twoFactorEnabled: false,
        twoFactorBackupCodeHashes: [],
      },
    });
    return { success: true };
  }

  async changePassword(userId: string, dto: ChangePasswordDto, mobile = false) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.passwordHash) {
      throw new BadRequestException(
        'This account signs in with Google and has no password to change',
      );
    }
    const matches = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);
    // Bumping tokenVersion invalidates every other session — same mechanism
    // logout() uses — but buildAuthResponse below mints a fresh token for
    // THIS session so the caller stays logged in.
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });

    return this.buildAuthResponse(updated, mobile);
  }

  // `exp` is always present in practice — it comes from the verified JWT
  // itself (JwtStrategy.validate), not something the caller supplies — the
  // `| undefined` only reflects jsonwebtoken's own typing for a decoded
  // payload. Falls back to a 30-day TTL in that in-practice-unreachable case
  // so the revocation row still has a sane expiresAt rather than "now".
  async logout(jti: string, exp?: number) {
    // Revokes only THIS token/session — see JwtStrategy.validate and
    // RevokedToken's own doc comment for why this is no longer the
    // tokenVersion-bump used by changePassword (which should still kill
    // every other session; a plain logout shouldn't).
    const expiresAt = exp
      ? new Date(exp * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.prisma.revokedToken.upsert({
      where: { jti },
      create: { jti, expiresAt },
      update: {},
    });
  }

  async currentSession(userId: string) {
    const [membership, guild] = await Promise.all([
      this.prisma.membership.findFirst({
        where: { userId },
        include: { org: true },
      }),
      this.prisma.guildMembership.findFirst({
        where: { userId },
        include: { org: true },
      }),
    ]);

    return {
      org: membership
        ? {
            id: membership.org.id,
            name: membership.org.name,
            role: membership.role,
            isOwner: membership.isOwner,
          }
        : null,
      guild: guild
        ? {
            id: guild.org.id,
            name: guild.org.name,
            role: guild.role,
          }
        : membership
          ? {
              id: membership.org.id,
              name: membership.org.name,
              role: membership.isOwner ? GuildRole.LEADER : GuildRole.MEMBER,
            }
          : null,
    };
  }

  private async buildAuthResponse(user: User, mobile = false) {
    const session = await this.currentSession(user.id);

    const payload = {
      sub: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
      // Gives this specific token an identity RevokedToken can target —
      // without it, logout would have no way to revoke only this session.
      jti: randomUUID(),
    };
    // Mobile keeps people logged in for a month regardless of JWT_EXPIRES_IN
    // (tuned for the web app) — nobody wants to re-enter their password
    // every few days on their phone. Only overriding expiresIn when mobile
    // keeps the existing single-arg signAsync call (and its tests) intact
    // for every other login path.
    const accessToken = mobile
      ? await this.jwtService.signAsync(payload, {
          expiresIn: MOBILE_ACCESS_TOKEN_EXPIRES_IN,
        })
      : await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        phone: user.phone,
        profileComplete: isProfileComplete(user),
        hasPassword: !!user.passwordHash,
        hasGoogle: !!user.googleId,
        twoFactorEnabled: user.twoFactorEnabled,
      },
      org: session.org,
      guild: session.guild,
    };
  }
}
