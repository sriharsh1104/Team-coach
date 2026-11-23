import { Module } from '@nestjs/common';
import { OrgService } from './org.service';
import { OrgController } from './org.controller';
import { PushNotificationService } from '../common/push-notification.service';
import { MediaModule } from '../media/media.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [MediaModule, AuthModule],
  providers: [OrgService, PushNotificationService],
  controllers: [OrgController],
})
export class OrgModule {}
