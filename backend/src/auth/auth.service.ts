import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { TwoFactorEnableDto } from './dto/two-factor-enable.dto';
import { TwoFactorDisableDto } from './dto/two-factor-disable.dto';
import { TwoFactorVerifyDto } from './dto/two-factor-verify.dto';
import { User } from '@prisma/client';
import { isProfileComplete } from '../users/users.service';
import {
  generateBackupCodes,
  generateQrCodeDataUrl,
  generateTwoFactorSecret,
  verifyTwoFactorCode,
} from './two-factor.util';

const BCRYPT_SALT_ROUNDS = 12;

interface TwoFactorChallengePayload {
  sub: string;
  purpose: '2fa-challenge';
}

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.googleClient = new OAuth2Client(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
    );
  }

  async signup(dto: SignupDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash, name: dto.name },
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
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

    return this.completeLoginOrChallenge(user);
  }

  async googleLogin(dto: GoogleLoginDto) {
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
      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.idToken,
        audience: this.configService.get<string>('GOOGLE_CLIENT_ID'),
      });
      payload = ticket.getPayload() ?? {};
    } catch {
      throw new UnauthorizedException('Invalid Google token');
    }

    if (!payload.sub || !payload.email) {
      throw new UnauthorizedException('Invalid Google token');
    }

    // An unverified email on Google's side could belong to someone other
    // than the account holder — don't let it link to or create a Team Coach
    // account under that email.
    if (!payload.email_verified) {
      throw new UnauthorizedException('Your Google email is not verified');
    }

    let user = await this.prisma.user.findUnique({
      where: { googleId: payload.sub },
    });

    if (!user) {
      const existingByEmail = await this.prisma.user.findUnique({
        where: { email: payload.email },
      });

      if (existingByEmail) {
        user = await this.prisma.user.update({
          where: { id: existingByEmail.id },
          data: { googleId: payload.sub },
        });
      } else {
        user = await this.prisma.user.create({
          data: {
            email: payload.email,
            googleId: payload.sub,
            name: payload.name ?? payload.email,
            avatarUrl: payload.picture,
          },
        });
      }
    }

    return this.completeLoginOrChallenge(user);
  }

  // 2FA is a property of the account, not the login method — applies the
  // same way whether credentials came from a password or Google.
  private async completeLoginOrChallenge(user: User) {
    if (!user.twoFactorEnabled) {
      return this.buildAuthResponse(user);
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

  async verifyTwoFactorLogin(dto: TwoFactorVerifyDto) {
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
      const valid = user.twoFactorSecret
        ? verifyTwoFactorCode(user.twoFactorSecret, dto.code)
        : false;
      if (!valid) throw new UnauthorizedException('Invalid code');
      return this.buildAuthResponse(user);
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
      return this.buildAuthResponse(updated);
    }

    throw new BadRequestException('A code or backup code is required');
  }

  async setupTwoFactor(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const { base32: secret, otpauthUrl } = generateTwoFactorSecret(user.email);
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret },
    });
    const qrCodeDataUrl = await generateQrCodeDataUrl(otpauthUrl);
    return { secret, qrCodeDataUrl };
  }

  async enableTwoFactor(userId: string, dto: TwoFactorEnableDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.twoFactorSecret) {
      throw new BadRequestException('Call /auth/2fa/setup first');
    }
    const valid = verifyTwoFactorCode(user.twoFactorSecret, dto.code);
    if (!valid) {
      throw new UnauthorizedException('Invalid code');
    }

    const backupCodes = generateBackupCodes();
    const hashes = await Promise.all(
      backupCodes.map((code) => bcrypt.hash(code, BCRYPT_SALT_ROUNDS)),
    );
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true, twoFactorBackupCodeHashes: hashes },
    });

    return { backupCodes };
  }

  async disableTwoFactor(userId: string, dto: TwoFactorDisableDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.passwordHash) {
      throw new BadRequestException('This account has no password set');
    }
    const matches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Incorrect password');
    }

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

  async changePassword(userId: string, dto: ChangePasswordDto) {
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

    return this.buildAuthResponse(updated);
  }

  async logout(userId: string) {
    // Bumping tokenVersion invalidates every outstanding token for this
    // user (all devices/sessions), not just whichever one called this —
    // simple, and fine for this app's scale; see JwtStrategy.validate.
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
  }

  private async buildAuthResponse(user: User) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId: user.id },
      include: { org: true },
    });

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
    });

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
        twoFactorEnabled: user.twoFactorEnabled,
      },
      org: membership
        ? {
            id: membership.org.id,
            name: membership.org.name,
            role: membership.role,
            isOwner: membership.isOwner,
          }
        : null,
    };
  }
}
