import { IsString, MaxLength } from 'class-validator';

export class ClearChatDto {
  @IsString()
  @MaxLength(120)
  channelKey: string;
}
