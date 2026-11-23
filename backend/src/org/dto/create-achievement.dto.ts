import {
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateAchievementDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  /** Grand-final / finish date as YYYY-MM-DD. */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Date must be YYYY-MM-DD',
  })
  date: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== '' && v != null)
  @IsString()
  @IsUrl({ require_protocol: true }, { message: 'Link must be a full URL' })
  @MaxLength(500)
  grandFinalLink?: string;

  /** Placement — "1st", "2nd", "Champion", etc. */
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  standing: string;
}
