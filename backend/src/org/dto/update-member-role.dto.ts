import { IsIn, IsString } from 'class-validator';
import { MembershipRole } from '@prisma/client';

export class UpdateMemberRoleDto {
  @IsString()
  targetUserId: string;

  @IsIn([MembershipRole.PLAYER, MembershipRole.COACH, MembershipRole.ANALYST])
  role: MembershipRole;
}
