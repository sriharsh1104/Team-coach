import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { PushNotificationService } from '../common/push-notification.service';

@Module({
  imports: [AuthModule],
  providers: [MediaService, PushNotificationService],
  controllers: [MediaController],
  exports: [MediaService],
})
export class MediaModule {}
