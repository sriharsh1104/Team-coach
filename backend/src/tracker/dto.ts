import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateHealthGoalsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(100000)
  stepGoal?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  heartGoal?: number;
}

export class HealthTodayQueryDto {
  @IsOptional()
  @IsString()
  @Matches(DAY_RE)
  day?: string;
}

export class UpsertHealthDayDto {
  @IsString()
  @Matches(DAY_RE)
  day: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(500000)
  steps: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  heartPoints?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  source?: string;
}

export class CreateRoutineDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title: string;

  @IsString()
  @Matches(TIME_RE)
  timeLocal: string;

  @IsOptional()
  @IsBoolean()
  alarmEnabled?: boolean;
}

export class UpdateRoutineDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_RE)
  timeLocal?: string;

  @IsOptional()
  @IsBoolean()
  alarmEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class RoutinesQueryDto {
  @IsOptional()
  @IsString()
  @Matches(DAY_RE)
  day?: string;
}

export class CompleteRoutineDto {
  @IsString()
  @Matches(DAY_RE)
  day: string;
}
