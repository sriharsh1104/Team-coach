import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { PushNotificationService } from '../common/push-notification.service';
import { GamesLinkController } from './games-link.controller';
import { GamesStatsController } from './games-stats.controller';
import { GamesStatsService } from './games-stats.service';
import { GamesGateway } from './games.gateway';
import { GamesService } from './games.service';

/**
 * In-app Games section: seven live mini-games over Socket.IO (/games), plus
 * the REST leaderboard/stats read off the match history they leave behind.
 */
@Module({
  imports: [AuthModule, ChatModule],
  controllers: [GamesLinkController, GamesStatsController],
  providers: [
    GamesService,
    GamesGateway,
    GamesStatsService,
    PushNotificationService,
  ],
})
export class GamesModule {}
