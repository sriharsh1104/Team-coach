import { IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

export class UpdateFreeFireGuildDto {
  /** Digits-only Free Fire guild ID, or empty/null to clear. */
  @IsOptional()
  @ValidateIf((_, v) => v !== '' && v != null)
  @IsString()
  @Matches(/^\d+$/, { message: 'Free Fire guild ID must contain only numbers' })
  @MaxLength(20)
  freeFireGuildId?: string | null;
}
