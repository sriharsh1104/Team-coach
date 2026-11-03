import { IsIn, IsOptional } from 'class-validator';
import { MembershipRole } from '@prisma/client';

export class SetOwnRosterRoleDto {
  @IsOptional()
  @IsIn([MembershipRole.PLAYER, MembershipRole.COACH, MembershipRole.ANALYST])
  role?: MembershipRole | null;
}
