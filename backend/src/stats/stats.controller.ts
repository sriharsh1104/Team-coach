import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { StatMode } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StatsService } from './stats.service';
import { RequestExtractionDto } from './dto/request-extraction.dto';
import { UpdateExtractionRowsDto } from './dto/update-extraction-rows.dto';

function parseMode(raw: string | undefined): StatMode {
  if (!raw || !(Object.values(StatMode) as string[]).includes(raw)) {
    throw new BadRequestException(
      'mode query is required (BR | CS | SCRIM | TOURNAMENT)',
    );
  }
  return raw as StatMode;
}

@UseGuards(JwtAuthGuard)
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Post('extractions')
  requestExtractions(
    @CurrentUser() user: { userId: string },
    @Body() dto: RequestExtractionDto,
  ) {
    return this.statsService.requestExtractions(user.userId, {
      mode: dto.mode,
      mediaPostIds: dto.mediaPostIds,
      scrimEventId: dto.scrimEventId,
    });
  }

  @Get('extractions')
  listExtractions(
    @CurrentUser() user: { userId: string },
    @Query('mode') mode?: string,
  ) {
    const parsed =
      mode && (Object.values(StatMode) as string[]).includes(mode)
        ? (mode as StatMode)
        : undefined;
    return this.statsService.list(user.userId, parsed);
  }

  @Get('extractions/:id')
  getExtraction(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.statsService.getOne(user.userId, id);
  }

  @Post('extractions/:id/retry')
  retryExtraction(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.statsService.retry(user.userId, id);
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
  leaderboard(
    @CurrentUser() user: { userId: string },
    @Query('mode') mode: string,
  ) {
    return this.statsService.getOrgLeaderboard(user.userId, parseMode(mode));
  }

  @Get('history')
  history(
    @CurrentUser() user: { userId: string },
    @Query('mode') mode: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.statsService.getModeHistory(user.userId, parseMode(mode), {
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('players/:id')
  playerStats(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Query('mode') mode: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.statsService.getPlayerStats(user.userId, id, parseMode(mode), {
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
