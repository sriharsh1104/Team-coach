import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { VoiceService } from './voice.service';
import { VoiceController } from './voice.controller';
import { VoiceGateway } from './voice.gateway';
import { MediasoupSfuService } from './mediasoup-sfu.service';

@Module({
  imports: [AuthModule, ChatModule],
  providers: [VoiceService, VoiceGateway, MediasoupSfuService],
  controllers: [VoiceController],
})
export class VoiceModule {}
