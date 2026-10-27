import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PushNotificationService } from '../common/push-notification.service';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';

@Module({
  imports: [AuthModule],
  providers: [ChatService, ChatGateway, PushNotificationService],
  controllers: [ChatController],
  exports: [ChatService],
})
export class ChatModule {}
