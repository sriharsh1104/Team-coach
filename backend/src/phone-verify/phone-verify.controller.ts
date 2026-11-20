import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ConfirmPhoneCodeDto, StartPhoneVerifyDto } from './dto';
import { PhoneVerifyService } from './phone-verify.service';
import { TelegramBot, TelegramUpdate } from './telegram-bot';

@Controller()
export class PhoneVerifyController {
  private readonly logger = new Logger(PhoneVerifyController.name);

  constructor(
    private readonly phoneVerify: PhoneVerifyService,
    private readonly bot: TelegramBot,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('users/me/phone/telegram')
  startTelegram(
    @CurrentUser() user: { userId: string },
    @Body() dto: StartPhoneVerifyDto,
  ) {
    return this.phoneVerify.startTelegramLink(user.userId, dto.phone);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @Post('users/me/phone/telegram/verify')
  confirmCode(
    @CurrentUser() user: { userId: string },
    @Body() dto: ConfirmPhoneCodeDto,
  ) {
    return this.phoneVerify.confirmCode(user.userId, dto.code);
  }

  /**
   * Called by Telegram (not by the app). Gated by the secret token we set in
   * setWebhook, and excluded from the IP throttler because all Telegram traffic
   * arrives from a handful of shared IPs.
   */
  @SkipThrottle()
  @HttpCode(200)
  @Post('telegram/webhook')
  async telegramWebhook(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: TelegramUpdate,
  ) {
    if (!this.bot.secretMatches(secret)) throw new ForbiddenException();
    try {
      await this.phoneVerify.handleUpdate(update);
    } catch (err) {
      this.logger.error(`Telegram update failed: ${(err as Error).message}`);
    }
    return { ok: true };
  }
}
