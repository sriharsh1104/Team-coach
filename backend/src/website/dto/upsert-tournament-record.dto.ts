import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

const KINDS = [
  'result',
  'qualified',
  'registered',
  'upcoming',
  'did_not_qualify',
  'skipped',
] as const;

export class UpsertTournamentRecordDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(80)
  status!: string;

  @IsIn([...KINDS])
  kind!: (typeof KINDS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(400)
  progress?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  qualifierDate?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
