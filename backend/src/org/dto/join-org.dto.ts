import { IsOptional, IsString } from 'class-validator';

export class JoinOrgDto {
  // Provide either the short org code a player types in, or the token from a
  // shared referral link. Joiners are always admitted as PLAYER — the org
  // owner promotes people to COACH / ANALYST afterwards (see changeMemberRole).
  @IsOptional()
  @IsString()
  orgCode?: string;

  @IsOptional()
  @IsString()
  referralToken?: string;
}
