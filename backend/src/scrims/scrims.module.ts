import { Module, forwardRef } from '@nestjs/common';
import { MembershipModule } from '../membership/membership.module';
import { PushNotificationService } from '../common/push-notification.service';
import { ChatModule } from '../chat/chat.module';
import { ScrimsService } from './scrims.service';
import { ScrimsController } from './scrims.controller';
import { ScrimsReminderService } from './scrims-reminder.service';

@Module({
  imports: [MembershipModule, forwardRef(() => ChatModule)],
  providers: [ScrimsService, ScrimsReminderService, PushNotificationService],
  controllers: [ScrimsController],
})
export class ScrimsModule {}
