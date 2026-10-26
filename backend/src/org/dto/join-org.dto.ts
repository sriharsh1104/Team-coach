import { IsIn, IsOptional, IsString } from 'class-validator';
import { MembershipRole } from '@prisma/client';

export class JoinOrgDto {
  // Provide either the short org code a player types in, or the token from a shared referral link.
  @IsOptional()
  @IsString()
  orgCode?: string;

  @IsOptional()
  @IsString()
  referralToken?: string;

  @IsIn([MembershipRole.PLAYER, MembershipRole.COACH])
  role: MembershipRole;
}
