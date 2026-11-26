import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GamesStatsService, parseMiniGameKind } from './games-stats.service';

/**
 * Read-only leaderboard + per-player stats for the in-app mini-games. Lives
 * next to GamesLinkController (also `games`) but needs real auth — unlike
 * that one, which is a public invite-link landing page.
 */
@UseGuards(JwtAuthGuard)
@Controller('games')
export class GamesStatsController {
  constructor(private readonly gamesStats: GamesStatsService) {}

  /** `?game=chess` narrows to one game; omit it for the combined board. */
  @Get('leaderboard')
  leaderboard(
    @CurrentUser() user: { userId: string },
    @Query('game') game?: string,
  ) {
    return this.gamesStats.leaderboard(user.userId, parseMiniGameKind(game));
  }

  @Get('stats')
  myStats(@CurrentUser() user: { userId: string }) {
    return this.gamesStats.playerStats(user.userId);
  }

  @Get('stats/:userId')
  playerStats(
    @CurrentUser() user: { userId: string },
    @Param('userId') userId: string,
  ) {
    return this.gamesStats.playerStats(user.userId, userId);
  }
}
