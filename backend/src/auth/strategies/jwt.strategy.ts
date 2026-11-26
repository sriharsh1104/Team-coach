import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

/** What `@CurrentUser()` resolves to on an authenticated request. */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  jti: string;
  exp?: number;
  /** Straight from the database on this request — never from the token. */
  isPlatformAdmin: boolean;
}

export interface JwtPayload {
  sub: string;
  email: string;
  tokenVersion: number;
  jti: string;
  // Populated by the jsonwebtoken library itself on verify, not something we
  // set when signing — present on every verified token regardless.
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    // tokenVersion lets changePassword invalidate every outstanding token
    // for a user at once (the right call when the password itself changed);
    // RevokedToken lets a single logout kill just the one session that
    // called it, without touching any other device. JWTs can't be revoked
    // server-side any other way once issued, short of waiting for expiry.
    const [user, revoked] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: payload.sub },
        // isPlatformAdmin is read here, on every request, and never taken
        // from the JWT. A token minted before the grant (or after it was
        // revoked) therefore carries no authority of its own — forging the
        // claim achieves nothing because nothing reads it.
        select: {
          tokenVersion: true,
          isPlatformAdmin: true,
          blockedAt: true,
          deactivatedAt: true,
        },
      }),
      payload.jti
        ? this.prisma.revokedToken.findUnique({ where: { jti: payload.jti } })
        : null,
    ]);
    if (!user || user.tokenVersion !== payload.tokenVersion || revoked) {
      throw new UnauthorizedException('Session has been logged out');
    }
    // Checked here rather than only at login, so blocking someone who is
    // already signed in takes effect on their very next request instead of
    // whenever their token happens to expire. Distinct message: "logged out"
    // would send a blocked user round the login loop forever.
    if (user.blockedAt) {
      throw new UnauthorizedException(
        'This account has been blocked by an administrator',
      );
    }
    if (user.deactivatedAt) {
      throw new UnauthorizedException(
        'This account is deactivated — sign in again to reactivate',
      );
    }
    return {
      userId: payload.sub,
      email: payload.email,
      jti: payload.jti,
      exp: payload.exp,
      isPlatformAdmin: user.isPlatformAdmin,
    };
  }
}
