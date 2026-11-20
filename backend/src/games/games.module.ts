import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { PushNotificationService } from '../common/push-notification.service';
import { GamesLinkController } from './games-link.controller';
import { GamesGateway } from './games.gateway';
import { GamesService } from './games.service';

/** In-app Games section: Stone Paper Scissors + Ludo over Socket.IO (/games). */
@Module({
  imports: [AuthModule, ChatModule],
  controllers: [GamesLinkController],
  providers: [GamesService, GamesGateway, PushNotificationService],
})
export class GamesModule {}
