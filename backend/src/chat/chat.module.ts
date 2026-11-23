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
import { LinkPreviewService } from './link-preview.service';

@Module({
  imports: [AuthModule, MediaModule],
  providers: [
    ChatService,
    ChatGateway,
    PushNotificationService,
    ChatPresenceTracker,
    ChatDisappearService,
    ChatReminderService,
    LinkPreviewService,
  ],
  controllers: [ChatController],
  exports: [ChatService, ChatGateway, ChatPresenceTracker],
})
export class ChatModule {}
