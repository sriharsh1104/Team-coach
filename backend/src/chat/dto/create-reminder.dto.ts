import { IsDateString, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateReminderDto {
  @IsString()
  channelKey!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  message!: string;

  @IsDateString()
  fireAt!: string;
}
