import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ListTournamentRecordsQueryDto } from './dto/list-tournament-records.query.dto';
import { UpsertTournamentRecordDto } from './dto/upsert-tournament-record.dto';
import { WebsiteService } from './website.service';

@Controller()
export class WebsiteController {
  constructor(private readonly websiteService: WebsiteService) {}

  /** Public marketing site — no auth. */
  @Get('public/tournament-records')
  listPublic(@Query() query: ListTournamentRecordsQueryDto) {
    return this.websiteService.listTournamentRecords(
      query.page ?? 1,
      query.pageSize ?? 10,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('tournament-records')
  listForTeam(@Query() query: ListTournamentRecordsQueryDto) {
    return this.websiteService.listTournamentRecords(
      query.page ?? 1,
      query.pageSize ?? 10,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('tournament-records')
  create(
    @CurrentUser() user: { userId: string },
    @Body() dto: UpsertTournamentRecordDto,
  ) {
    return this.websiteService.createTournamentRecord(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('tournament-records/:id')
  update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpsertTournamentRecordDto,
  ) {
    return this.websiteService.updateTournamentRecord(user.userId, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('tournament-records/:id')
  remove(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.websiteService.removeTournamentRecord(user.userId, id);
  }
}
