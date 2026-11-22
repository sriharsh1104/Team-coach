import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OrgService } from './org.service';
import { CreateOrgDto } from './dto/create-org.dto';
import { JoinOrgDto } from './dto/join-org.dto';
import {
  CancelGuildJoinDto,
  DecideGuildJoinDto,
  RequestGuildJoinDto,
} from './dto/guild-join-request.dto';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { RemoveMemberDto } from './dto/remove-member.dto';
import { AddRosterMemberDto } from './dto/add-roster-member.dto';
import { UpdateOrgSettingsDto } from './dto/update-org-settings.dto';
import { SetOwnRosterRoleDto } from './dto/set-own-roster-role.dto';

// An org code is guessable by brute force without a limit here — tighter
// than the app-wide default. Relaxed in tests, see app.module.ts.
const joinThrottleLimit = () => (process.env.NODE_ENV === 'test' ? 100000 : 5);

@UseGuards(JwtAuthGuard)
@Controller('orgs')
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  @Post()
  create(@CurrentUser() user: { userId: string }, @Body() dto: CreateOrgDto) {
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

  @Patch('me/role')
  setOwnRole(
    @CurrentUser() user: { userId: string },
    @Body() dto: SetOwnRosterRoleDto,
  ) {
    return this.orgService.setOwnRosterRole(user.userId, dto);
  }

  /** Searchable guild list for users who are not in a guild yet. */
  @Get('guild/browse')
  browseGuilds(
    @CurrentUser() user: { userId: string },
    @Query('q') q?: string,
  ) {
    return this.orgService.browseGuilds(user.userId, q);
  }

  @Throttle({ default: { limit: joinThrottleLimit, ttl: 60000 } })
  @Post('guild/join')
  joinGuild(@CurrentUser() user: { userId: string }, @Body() dto: JoinOrgDto) {
    return this.orgService.joinGuild(user.userId, dto);
  }

  /**
   * Browse-list join is a request the owner approves — only a guild code or
   * invite link joins outright (see OrgService.joinGuild).
   */
  @Throttle({ default: { limit: joinThrottleLimit, ttl: 60000 } })
  @Post('guild/request')
  requestGuildJoin(
    @CurrentUser() user: { userId: string },
    @Body() dto: RequestGuildJoinDto,
  ) {
    return this.orgService.requestGuildJoin(user.userId, dto.orgId);
  }

  /** The caller's own outstanding / decided requests. */
  @Get('guild/requests/mine')
  myGuildJoinRequests(@CurrentUser() user: { userId: string }) {
    return this.orgService.myGuildJoinRequests(user.userId);
  }

  @Post('guild/requests/cancel')
  cancelGuildJoinRequest(
    @CurrentUser() user: { userId: string },
    @Body() dto: CancelGuildJoinDto,
  ) {
    return this.orgService.cancelGuildJoinRequest(user.userId, dto.requestId);
  }

  /** Pending requests waiting on this org's leadership. */
  @Get('guild/requests')
  listGuildJoinRequests(@CurrentUser() user: { userId: string }) {
    return this.orgService.listGuildJoinRequests(user.userId);
  }

  @Post('guild/requests/decide')
  decideGuildJoinRequest(
    @CurrentUser() user: { userId: string },
    @Body() dto: DecideGuildJoinDto,
  ) {
    return this.orgService.decideGuildJoinRequest(
      user.userId,
      dto.requestId,
      dto.accept,
    );
  }

  /** Leave guild (+ roster seat for that org). Owner must transfer first. */
  @Post('guild/leave')
  leaveGuild(@CurrentUser() user: { userId: string }) {
    return this.orgService.leaveGuild(user.userId);
  }

  @Get('guild/me')
  getMyGuild(@CurrentUser() user: { userId: string }) {
    return this.orgService.getMyGuild(user.userId);
  }

  @Post('guild/roster')
  addToRoster(
    @CurrentUser() user: { userId: string },
    @Body() dto: AddRosterMemberDto,
  ) {
    return this.orgService.addGuildMemberToRoster(user.userId, dto);
  }

  @Post('guild/roster/remove')
  removeFromRoster(
    @CurrentUser() user: { userId: string },
    @Body() dto: RemoveMemberDto,
  ) {
    return this.orgService.removeFromRoster(user.userId, dto);
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

  @Patch('settings')
  updateSettings(
    @CurrentUser() user: { userId: string },
    @Body() dto: UpdateOrgSettingsDto,
  ) {
    return this.orgService.updateHistorySetting(
      user.userId,
      dto.historyVisibleToNewMembers,
    );
  }
}
