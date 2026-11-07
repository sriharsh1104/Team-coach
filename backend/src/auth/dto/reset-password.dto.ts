import { IsEmail, IsString, Matches, MinLength } from 'class-validator';
import { PASSWORD_REGEX, PASSWORD_REGEX_MESSAGE } from '../password.util';

export class ResetPasswordDto {
  @IsEmail()
  email: string;

  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' })
  code: string;

  @IsString()
  @MinLength(8)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_REGEX_MESSAGE })
  newPassword: string;
}
