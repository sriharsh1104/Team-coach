import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PhoneVerifyController } from './phone-verify.controller';
import { PhoneVerifyService } from './phone-verify.service';
import { TelegramBot } from './telegram-bot';

@Module({
  imports: [AuthModule],
  providers: [TelegramBot, PhoneVerifyService],
  controllers: [PhoneVerifyController],
})
export class PhoneVerifyModule {}
