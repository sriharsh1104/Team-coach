import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

// Kept as a simple constant list for now rather than an admin-editable table —
// enough for Phase 1B, can move to a DB-backed catalog later without an API change
// since the client never hardcodes anything beyond this list's values.
export const ROLE_OPTIONS = [
  'IGL',
  'ENTRY_FRAGGER',
  'SUPPORT',
  'SNIPER',
  'FLANKER',
  'LURKER',
  'RIFLER',
  'GRENADIER',
] as const;

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ROLE_OPTIONS.length)
  @IsIn(ROLE_OPTIONS, { each: true })
  roles?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(50)
  inGameName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  inGameUid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsUrl()
  whatsappUrl?: string;

  @IsOptional()
  @IsUrl()
  instagramUrl?: string;

  @IsOptional()
  @IsUrl()
  discordUrl?: string;

  @IsOptional()
  @IsUrl()
  youtubeUrl?: string;
}
