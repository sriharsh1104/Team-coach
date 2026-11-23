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
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { AdminService } from './admin.service';
import { DeleteOrgDto, ListOrgsQueryDto, SetDirectVoiceDto } from './dto';

/**
 * Platform admin. Read-only apart from the 1-on-1 voice permission and the
 * guild deletion below.
 *
 * Both guards are applied at the controller level so a route added later
 * cannot be published unguarded by forgetting a decorator. PlatformAdminGuard
 * reads a flag JwtStrategy loaded from the database on this request, so there
 * is nothing here a caller can spoof by editing a token or a payload.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  overview() {
    return this.adminService.overview();
  }

  /**
   * Backend service health. Separate from the public GET /health, which is
   * deliberately dumb (uptime only, no DB) because an uptime pinger hits it
   * every few minutes. This one actually probes the database and reports the
   * configuration of every dependent service, so it stays behind the guards.
   */
  @Get('health')
  health() {
    return this.adminService.health();
  }

  @Get('orgs')
  listOrgs(@Query() query: ListOrgsQueryDto) {
    return this.adminService.listOrgs(query);
  }

  @Get('orgs/:id')
  orgDetail(@Param('id') id: string) {
    return this.adminService.orgDetail(id);
  }

  /**
   * Delete a guild and everything in it. The only destructive route here —
   * the body must carry the guild's exact name, so this cannot happen by
   * mis-tapping a row.
   */
  @Delete('orgs/:id')
  deleteOrg(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: DeleteOrgDto,
  ) {
    return this.adminService.deleteOrg(user.userId, id, dto);
  }

  @Get('admins')
  listAdmins() {
    return this.adminService.listAdmins();
  }

  /** Who can use 1-on-1 voice today. */
  @Get('direct-voice')
  listDirectVoiceUsers() {
    return this.adminService.listDirectVoiceUsers();
  }

  /**
   * Grant or revoke 1-on-1 voice for one person. Granting to one side alone
   * opens nothing — a call needs the flag on both.
   */
  @Post('direct-voice')
  setDirectVoice(@Body() dto: SetDirectVoiceDto) {
    return this.adminService.setDirectVoice(dto);
  }
}
