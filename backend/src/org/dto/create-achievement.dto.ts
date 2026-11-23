import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  points?: number;
}
