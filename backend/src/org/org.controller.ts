import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OrgService } from './org.service';
import { CreateOrgDto } from './dto/create-org.dto';
import { JoinOrgDto } from './dto/join-org.dto';

@UseGuards(JwtAuthGuard)
@Controller('orgs')
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  @Post()
  create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateOrgDto,
  ) {
    return this.orgService.createOrg(user.userId, dto);
  }

  @Post('join')
  join(@CurrentUser() user: { userId: string }, @Body() dto: JoinOrgDto) {
    return this.orgService.joinOrg(user.userId, dto);
  }

  @Get('me')
  getMine(@CurrentUser() user: { userId: string }) {
    return this.orgService.getMyOrgWithMembers(user.userId);
  }
}
