import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { TwoFactorEnableDto } from './dto/two-factor-enable.dto';
import { TwoFactorDisableDto } from './dto/two-factor-disable.dto';
import { TwoFactorVerifyDto } from './dto/two-factor-verify.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendEmailVerificationDto } from './dto/resend-email-verification.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { isProfileComplete } from '../users/users.service';

// Tighter than the app-wide default (20/60s) — these are the routes a
// credential-stuffing/brute-force script would actually hammer. Relaxed in
// tests the same way as the global limit (see app.module.ts).
const authThrottleLimit = () => (process.env.NODE_ENV === 'test' ? 100000 : 5);

// Resend is specifically an email-spam vector, not just a brute-force one —
// tighter than the other auth routes.
const resendVerificationThrottleLimit = () =>
  process.env.NODE_ENV === 'test' ? 100000 : 3;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Throttle({ default: { limit: authThrottleLimit, ttl: 60000 } })
  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Throttle({ default: { limit: authThrottleLimit, ttl: 60000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Throttle({ default: { limit: authThrottleLimit, ttl: 60000 } })
  @Post('google')
  googleLogin(@Body() dto: GoogleLoginDto) {
    return this.authService.googleLogin(dto);
  }

  @Throttle({ default: { limit: authThrottleLimit, ttl: 60000 } })
  @Post('2fa/verify')
  verifyTwoFactor(@Body() dto: TwoFactorVerifyDto) {
    return this.authService.verifyTwoFactorLogin(dto);
  }

  @Throttle({ default: { limit: authThrottleLimit, ttl: 60000 } })
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmailSignup(dto);
  }

  @Throttle({ default: { limit: resendVerificationThrottleLimit, ttl: 60000 } })
  @Post('resend-verification')
  resendVerification(@Body() dto: ResendEmailVerificationDto) {
    return this.authService.resendEmailVerification(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@CurrentUser() currentUser: { userId: string }) {
    await this.authService.logout(currentUser.userId);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Patch('password')
  changePassword(
    @CurrentUser() currentUser: { userId: string },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(currentUser.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/setup')
  setupTwoFactor(@CurrentUser() currentUser: { userId: string }) {
    return this.authService.setupTwoFactor(currentUser.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enable')
  enableTwoFactor(
    @CurrentUser() currentUser: { userId: string },
    @Body() dto: TwoFactorEnableDto,
  ) {
    return this.authService.enableTwoFactor(currentUser.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/disable')
  disableTwoFactor(
    @CurrentUser() currentUser: { userId: string },
    @Body() dto: TwoFactorDisableDto,
  ) {
    return this.authService.disableTwoFactor(currentUser.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() currentUser: { userId: string }) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: currentUser.userId },
    });
    const membership = await this.prisma.membership.findFirst({
      where: { userId: currentUser.userId },
      include: { org: true },
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
      profileComplete: isProfileComplete(user),
      hasPassword: !!user.passwordHash,
      twoFactorEnabled: user.twoFactorEnabled,
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
