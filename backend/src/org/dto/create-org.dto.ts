import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { MembershipRole } from '@prisma/client';

export class CreateOrgDto {
  @IsString()
  @MinLength(2)
  name: string;

  // Older clients may still send a seat. New org creation leaves it empty
  // so the creator stays the owner until they choose a roster role.
  @IsOptional()
  @IsIn([MembershipRole.PLAYER, MembershipRole.COACH, MembershipRole.ANALYST])
  role?: MembershipRole;
}
