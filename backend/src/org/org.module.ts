import { Module } from '@nestjs/common';
import { OrgService } from './org.service';
import { OrgController } from './org.controller';
import { PushNotificationService } from '../common/push-notification.service';

@Module({
  providers: [OrgService, PushNotificationService],
  controllers: [OrgController],
})
export class OrgModule {}
