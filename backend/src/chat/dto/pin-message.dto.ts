import { IsBoolean, IsString, MaxLength } from 'class-validator';

export class PinMessageDto {
  @IsString()
  @MaxLength(120)
  channelKey: string;

  @IsString()
  @MaxLength(64)
  messageId: string;

  @IsBoolean()
  pinned: boolean;
}
