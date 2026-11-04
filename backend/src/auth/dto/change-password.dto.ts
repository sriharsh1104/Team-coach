import { IsString, Matches, MinLength } from 'class-validator';
import { PASSWORD_REGEX, PASSWORD_REGEX_MESSAGE } from '../password.util';

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_REGEX_MESSAGE })
  newPassword: string;
}
