import { IsEmail, IsString, Matches, MinLength } from 'class-validator';
import { PASSWORD_REGEX, PASSWORD_REGEX_MESSAGE } from '../password.util';

export class SignupDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_REGEX_MESSAGE })
  password: string;

  @IsString()
  @MinLength(1)
  name: string;
}
