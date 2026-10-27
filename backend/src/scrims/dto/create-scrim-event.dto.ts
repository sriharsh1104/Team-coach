import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ScrimRoundDto {
  @IsInt()
  @Min(1)
  roundNumber: number;

  @IsDateString()
  scheduledAt: string;

  @IsOptional()
  @IsIn(['PENDING', 'QUALIFIED', 'ELIMINATED'])
  result?: 'PENDING' | 'QUALIFIED' | 'ELIMINATED';
}

export class CreateScrimEventDto {
  @IsIn(['SCRIM', 'TOURNAMENT'])
  type: 'SCRIM' | 'TOURNAMENT';

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title: string;

  @IsDateString()
  scheduledAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  remind30?: boolean;

  @IsOptional()
  @IsBoolean()
  remind10?: boolean;

  /** Extra / all rounds. If omitted, Round 1 is created from scheduledAt. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScrimRoundDto)
  rounds?: ScrimRoundDto[];
}
