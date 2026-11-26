import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService, AuthSessionClientMeta } from './auth.service';
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
import { SetRecoveryEmailDto } from './dto/set-recovery-email.dto';
import { VerifyRecoveryEmailDto } from './dto/verify-recovery-email.dto';
import { SetSessionTrustDto } from './dto/set-session-trust.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthenticatedUser } from './strategies/jwt.strategy';
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

// The mobile app sets this header on every request (see mobile/src/api/client.ts)
// so routes that mint an access token can give it a much longer lifetime —
// see MOBILE_ACCESS_TOKEN_EXPIRES_IN in auth.service.ts.
const isMobileClient = (platform?: string) => platform === 'mobile';

function sessionClientMeta(
  req: Request,
  platform?: string,
): AuthSessionClientMeta {
  const deviceHeader = req.headers['x-device-name'];
  const deviceName = Array.isArray(deviceHeader)
    ? deviceHeader[0]
    : deviceHeader;
  return {
    platform: platform?.trim() || undefined,
    deviceName: deviceName?.trim() || undefined,
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  };
}

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
  login(
    @Body() dto: LoginDto,
    @Headers('x-client-platform') platform: string | undefined,
    @Req() req: Request,
  ) {
    return this.authService.login(
      dto,
      isMobileClient(platform),
      sessionClientMeta(req, platform),
    );
  }

  @Throttle({ default: { limit: authThrottleLimit, ttl: 60000 } })
  @Post('google')
  googleLogin(
    @Body() dto: GoogleLoginDto,
    @Headers('x-client-platform') platform: string | undefined,
    @Req() req: Request,
  ) {
    return this.authService.googleLogin(
      dto,
      isMobileClient(platform),
      sessionClientMeta(req, platform),
    );
  }

  @Throttle({ default: { limit: authThrottleLimit, ttl: 60000 } })
  @Post('2fa/verify')
  verifyTwoFactor(
    @Body() dto: TwoFactorVerifyDto,
    @Headers('x-client-platform') platform: string | undefined,
    @Req() req: Request,
  ) {
    return this.authService.verifyTwoFactorLogin(
      dto,
      isMobileClient(platform),
      sessionClientMeta(req, platform),
    );
  }

  @Throttle({ default: { limit: authThrottleLimit, ttl: 60000 } })
  @Post('verify-email')
  verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Headers('x-client-platform') platform: string | undefined,
    @Req() req: Request,
  ) {
    return this.authService.verifyEmailSignup(
      dto,
      isMobileClient(platform),
      sessionClientMeta(req, platform),
    );
  }

  @Throttle({ default: { limit: resendVerificationThrottleLimit, ttl: 60000 } })
  @Post('resend-verification')
  resendVerification(@Body() dto: ResendEmailVerificationDto) {
    return this.authService.resendEmailVerification(dto);
  }

  // Same tight limit as resend-verification — this is the other route that
  // sends an email per request and must not become a spam vector.
  @Throttle({ default: { limit: resendVerificationThrottleLimit, ttl: 60000 } })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Throttle({ default: { limit: authThrottleLimit, ttl: 60000 } })
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@CurrentUser() currentUser: AuthenticatedUser) {
    await this.authService.logout(currentUser.jti, currentUser.exp);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Patch('password')
  changePassword(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Headers('x-client-platform') platform: string | undefined,
    @Req() req: Request,
  ) {
    return this.authService.changePassword(
      currentUser.userId,
      dto,
      isMobileClient(platform),
      sessionClientMeta(req, platform),
    );
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: resendVerificationThrottleLimit, ttl: 60000 } })
  @Post('email-password')
  emailGeneratedPassword(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.authService.emailGeneratedPassword(currentUser.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/setup')
  setupTwoFactor(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: TwoFactorSetupDto,
  ) {
    return this.authService.setupTwoFactor(currentUser.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enable')
  enableTwoFactor(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: TwoFactorEnableDto,
  ) {
    return this.authService.enableTwoFactor(currentUser.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/disable')
  disableTwoFactor(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: TwoFactorDisableDto,
  ) {
    return this.authService.disableTwoFactor(currentUser.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  listSessions(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Headers('x-client-platform') platform: string | undefined,
    @Req() req: Request,
  ) {
    return this.authService.listSessions(
      currentUser.userId,
      currentUser.jti,
      currentUser.exp,
      sessionClientMeta(req, platform),
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sessions/:id')
  revokeSession(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.authService.revokeSession(
      currentUser.userId,
      id,
      currentUser.jti,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sessions')
  revokeOtherSessions(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.authService.revokeOtherSessions(
      currentUser.userId,
      currentUser.jti,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch('sessions/:id/trust')
  setSessionTrust(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetSessionTrustDto,
  ) {
    return this.authService.setSessionTrust(
      currentUser.userId,
      id,
      dto.trusted,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('recovery-email')
  getRecoveryEmail(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.authService.getRecoveryEmail(currentUser.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: resendVerificationThrottleLimit, ttl: 60000 } })
  @Post('recovery-email')
  requestRecoveryEmail(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: SetRecoveryEmailDto,
  ) {
    return this.authService.requestRecoveryEmail(
      currentUser.userId,
      dto.email,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: authThrottleLimit, ttl: 60000 } })
  @Post('recovery-email/verify')
  verifyRecoveryEmail(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: VerifyRecoveryEmailDto,
  ) {
    return this.authService.verifyRecoveryEmail(currentUser.userId, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('recovery-email')
  clearRecoveryEmail(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.authService.clearRecoveryEmail(currentUser.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() currentUser: AuthenticatedUser) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: currentUser.userId },
    });
    const session = await this.authService.currentSession(currentUser.userId);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
      profileComplete: isProfileComplete(user),
      hasPassword: !!user.passwordHash,
      hasGoogle: !!user.googleId,
      twoFactorEnabled: user.twoFactorEnabled,
      isPlatformAdmin: user.isPlatformAdmin,
      canDirectVoice: user.canDirectVoice,
      recoveryEmail: user.recoveryEmail,
      recoveryEmailVerified: !!user.recoveryEmailVerifiedAt,
      org: session.org,
      guild: session.guild,
    };
  }
}
