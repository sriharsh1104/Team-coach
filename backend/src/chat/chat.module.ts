import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { PushNotificationService } from '../common/push-notification.service';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatPresenceTracker } from './chat-presence.tracker';
import { ChatDisappearService } from './chat-disappear.service';
import { ChatReminderService } from './chat-reminder.service';

@Module({
  imports: [AuthModule, MediaModule],
  providers: [
    ChatService,
    ChatGateway,
    PushNotificationService,
    ChatPresenceTracker,
    ChatDisappearService,
    ChatReminderService,
  ],
  controllers: [ChatController],
  exports: [ChatService, ChatGateway],
})
export class ChatModule {}
