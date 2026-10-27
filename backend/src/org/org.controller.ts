import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OrgService } from './org.service';
import { CreateOrgDto } from './dto/create-org.dto';
import { JoinOrgDto } from './dto/join-org.dto';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { RemoveMemberDto } from './dto/remove-member.dto';

// A 6-character org code is guessable by brute force without a limit here —
// tighter than the app-wide default. Relaxed in tests, see app.module.ts.
const joinThrottleLimit = () => (process.env.NODE_ENV === 'test' ? 100000 : 5);

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

  @Throttle({ default: { limit: joinThrottleLimit, ttl: 60000 } })
  @Post('join')
  join(@CurrentUser() user: { userId: string }, @Body() dto: JoinOrgDto) {
    return this.orgService.joinOrg(user.userId, dto);
  }

  @Get('me')
  getMine(@CurrentUser() user: { userId: string }) {
    return this.orgService.getMyOrgWithMembers(user.userId);
  }

  @Patch('members/role')
  changeMemberRole(
    @CurrentUser() user: { userId: string },
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.orgService.changeMemberRole(user.userId, dto);
  }

  @Post('transfer-ownership')
  async transferOwnership(
    @CurrentUser() user: { userId: string },
    @Body() dto: TransferOwnershipDto,
  ) {
    await this.orgService.transferOwnership(user.userId, dto);
    return { success: true };
  }

  @Post('members/remove')
  async removeMember(
    @CurrentUser() user: { userId: string },
    @Body() dto: RemoveMemberDto,
  ) {
    await this.orgService.removeMember(user.userId, dto);
    return { success: true };
  }
}
