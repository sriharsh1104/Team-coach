import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { AdminService } from './admin.service';
import { ListOrgsQueryDto, SetDirectVoiceDto } from './dto';

/**
 * Platform admin. Read-only apart from the 1-on-1 voice permission below.
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

  @Get('orgs')
  listOrgs(@Query() query: ListOrgsQueryDto) {
    return this.adminService.listOrgs(query);
  }

  @Get('orgs/:id')
  orgDetail(@Param('id') id: string) {
    return this.adminService.orgDetail(id);
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
