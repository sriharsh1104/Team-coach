import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SetNicknameDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  targetUserId: string;

  /** Pass null / omit empty to clear the personal nickname. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  nickname?: string | null;
}
