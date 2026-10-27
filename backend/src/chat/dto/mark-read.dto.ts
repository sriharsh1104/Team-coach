import { IsOptional, IsString, MaxLength } from 'class-validator';

export class MarkReadDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  channelKey?: string;
}
