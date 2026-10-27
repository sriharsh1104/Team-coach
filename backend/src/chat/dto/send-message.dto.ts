import { IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class SendMessageDto {
  /** "org" for team chat, or "dm:{userA}:{userB}" with sorted ids. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  channelKey?: string;

  @ValidateIf((o) => !o.mediaUrl)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  mediaUrl?: string;

  @IsOptional()
  @IsIn(['IMAGE', 'VIDEO'])
  mediaType?: 'IMAGE' | 'VIDEO';
}
