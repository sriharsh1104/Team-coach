import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ExtractionRowDto {
  @IsString()
  rawName: string;

  @IsOptional()
  @IsString()
  matchedUserId: string | null;

  @IsInt()
  @Min(0)
  kills: number;

  @IsInt()
  @Min(0)
  deaths: number;

  @IsInt()
  @Min(0)
  assists: number;
}

export class UpdateExtractionRowsDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ExtractionRowDto)
  rows: ExtractionRowDto[];
}
