import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
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

  /** Free Fire guild ID — digits only; omit or blank to skip. */
  @IsOptional()
  @ValidateIf((_, v) => v !== '' && v != null)
  @IsString()
  @Matches(/^\d+$/, { message: 'Free Fire guild ID must contain only numbers' })
  @MaxLength(20)
  freeFireGuildId?: string;
}
