import { IsBoolean, IsString, MaxLength } from 'class-validator';

export class MuteChannelDto {
  @IsString()
  @MaxLength(120)
  channelKey: string;

  @IsBoolean()
  muted: boolean;
}
