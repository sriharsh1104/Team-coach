import { IsString, MinLength } from 'class-validator';

export class SetPushTokenDto {
  @IsString()
  @MinLength(1)
  token: string;
}
