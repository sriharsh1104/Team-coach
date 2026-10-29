import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { StatMode } from '@prisma/client';

export class RequestExtractionDto {
  @IsEnum(StatMode)
  mode: StatMode;

  // Matches the mobile image picker's own selectionLimit.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  mediaPostIds: string[];

  /** Tie this OCR upload to a specific Scrim / Tournament event. */
  @IsOptional()
  @IsString()
  scrimEventId?: string;
}
