import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/**
 * The global ValidationPipe runs with `whitelist` + `forbidNonWhitelisted`,
 * so anything not declared here is rejected with a 400 rather than reaching
 * Prisma.
 */
export class CreateAnnouncementDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title: string;

  // Long enough for a real match brief; capped so one post cannot be used to
  // dump unbounded text into every member's push tray and the database.
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body: string;
}

export class ListAnnouncementsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  take?: number;
}
