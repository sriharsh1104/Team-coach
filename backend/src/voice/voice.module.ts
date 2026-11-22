import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { MembershipModule } from '../membership/membership.module';
import { PushNotificationService } from '../common/push-notification.service';
import { VoiceService } from './voice.service';
import { VoiceController } from './voice.controller';
import { VoiceGateway } from './voice.gateway';
import { MediasoupSfuService } from './mediasoup-sfu.service';

@Module({
  imports: [AuthModule, ChatModule, MembershipModule],
  providers: [
    VoiceService,
    VoiceGateway,
    MediasoupSfuService,
    PushNotificationService,
  ],
  controllers: [VoiceController],
})
export class VoiceModule {}
