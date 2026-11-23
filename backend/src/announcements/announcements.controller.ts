import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto, ListAnnouncementsQueryDto } from './dto';

/**
 * Guild announcements. Reading is for anyone in the org; posting and deleting
 * are the owner's alone — enforced in the service against the database, not
 * by anything the client sends.
 */
@Controller('announcements')
@UseGuards(JwtAuthGuard)
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  list(
    @CurrentUser() user: { userId: string },
    @Query() query: ListAnnouncementsQueryDto,
  ) {
    return this.announcements.list(user.userId, query);
  }

  /** Badge count for the nav item — cheap enough to poll. */
  @Get('unread')
  unread(@CurrentUser() user: { userId: string }) {
    return this.announcements.unread(user.userId);
  }

  @Post()
  create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateAnnouncementDto,
  ) {
    return this.announcements.create(user.userId, dto);
  }

  /** What opening the section does. */
  @Post('read')
  markAllRead(@CurrentUser() user: { userId: string }) {
    return this.announcements.markAllRead(user.userId);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.announcements.remove(user.userId, id);
  }
}
