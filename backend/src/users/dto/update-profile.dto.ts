import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  DISCORD_URL_REGEX,
  INSTAGRAM_URL_REGEX,
  SOCIAL_URL_MESSAGES,
  WHATSAPP_URL_REGEX,
  YOUTUBE_URL_REGEX,
} from '../social-url.util';

// Kept as a simple constant list for now rather than an admin-editable table —
// enough for Phase 1B, can move to a DB-backed catalog later without an API change
// since the client never hardcodes anything beyond this list's values.
export const ROLE_OPTIONS = [
  'IGL',
  'PRIMARY_RUSHER',
  'SECONDARY_RUSHER',
  'GRENADIER_SUPPORT',
  'SNIPER',
] as const;

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1)
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
  @MaxLength(16)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(WHATSAPP_URL_REGEX, { message: SOCIAL_URL_MESSAGES.whatsappUrl })
  whatsappUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(INSTAGRAM_URL_REGEX, { message: SOCIAL_URL_MESSAGES.instagramUrl })
  instagramUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(DISCORD_URL_REGEX, { message: SOCIAL_URL_MESSAGES.discordUrl })
  discordUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(YOUTUBE_URL_REGEX, { message: SOCIAL_URL_MESSAGES.youtubeUrl })
  youtubeUrl?: string;
}
