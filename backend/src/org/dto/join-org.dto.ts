import { IsOptional, IsString } from 'class-validator';

export class JoinOrgDto {
  // Guild join: orgCode / referralToken (guild fields).
  // Roster join (joinOrg): rosterCode / referralToken (rosterReferralToken).
  @IsOptional()
  @IsString()
  orgCode?: string;

  @IsOptional()
  @IsString()
  rosterCode?: string;

  @IsOptional()
  @IsString()
  referralToken?: string;

  /** Optional inviter attribution from `/join/<token>?ref=<userId>`. */
  @IsOptional()
  @IsString()
  invitedByUserId?: string;
}
