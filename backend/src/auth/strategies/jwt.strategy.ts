import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

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
        select: { tokenVersion: true },
      }),
      payload.jti
        ? this.prisma.revokedToken.findUnique({ where: { jti: payload.jti } })
        : null,
    ]);
    if (!user || user.tokenVersion !== payload.tokenVersion || revoked) {
      throw new UnauthorizedException('Session has been logged out');
    }
    return {
      userId: payload.sub,
      email: payload.email,
      jti: payload.jti,
      exp: payload.exp,
    };
  }
}
