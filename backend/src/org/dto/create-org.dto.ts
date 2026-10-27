import { IsIn, IsString, MinLength } from 'class-validator';
import { MembershipRole } from '@prisma/client';

export class CreateOrgDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsIn([MembershipRole.PLAYER, MembershipRole.COACH, MembershipRole.ANALYST])
  role: MembershipRole;
}
