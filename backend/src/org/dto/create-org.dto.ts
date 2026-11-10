import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { MembershipRole } from '@prisma/client';

export class CreateOrgDto {
  @IsString()
  @MinLength(2)
  name: string;

  // Optional override — org.service.ts defaults the owner to COACH when
  // this isn't sent.
  @IsOptional()
  @IsIn([MembershipRole.PLAYER, MembershipRole.COACH, MembershipRole.ANALYST])
  role?: MembershipRole;
}
