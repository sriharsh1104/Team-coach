import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { AdminService } from './admin.service';
import { ListOrgsQueryDto } from './dto';

/**
 * Platform admin — read-only for now, on purpose.
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
}
