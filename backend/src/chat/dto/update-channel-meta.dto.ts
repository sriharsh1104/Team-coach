import { IsInt, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class UpdateChannelMetaDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  channelKey?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  disappearAfterSec?: number | null;
}
