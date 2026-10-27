import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StatsService } from './stats.service';
import { RequestExtractionDto } from './dto/request-extraction.dto';
import { UpdateExtractionRowsDto } from './dto/update-extraction-rows.dto';

@UseGuards(JwtAuthGuard)
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Post('extractions')
  requestExtraction(
    @CurrentUser() user: { userId: string },
    @Body() dto: RequestExtractionDto,
  ) {
    return this.statsService.requestExtraction(user.userId, dto.mediaPostId);
  }

  @Get('extractions')
  listExtractions(@CurrentUser() user: { userId: string }) {
    return this.statsService.list(user.userId);
  }

  @Patch('extractions/:id')
  updateExtraction(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateExtractionRowsDto,
  ) {
    return this.statsService.updateRows(user.userId, id, dto);
  }

  @Post('extractions/:id/confirm')
  confirmExtraction(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.statsService.confirm(user.userId, id);
  }

  @Post('extractions/:id/reject')
  rejectExtraction(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.statsService.reject(user.userId, id);
  }

  @Get('leaderboard')
  leaderboard(@CurrentUser() user: { userId: string }) {
    return this.statsService.getOrgLeaderboard(user.userId);
  }

  @Get('players/:id')
  playerStats(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.statsService.getPlayerStats(user.userId, id);
  }
}
