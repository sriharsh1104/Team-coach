import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MediaService } from './media.service';
import { MediaStorageService } from './media-storage.service';
import { MediaController } from './media.controller';
import { PushNotificationService } from '../common/push-notification.service';

@Module({
  imports: [AuthModule],
  providers: [MediaService, MediaStorageService, PushNotificationService],
  controllers: [MediaController],
  exports: [MediaService, MediaStorageService],
})
export class MediaModule {}
