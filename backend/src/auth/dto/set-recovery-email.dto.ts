import { IsEmail } from 'class-validator';

export class SetRecoveryEmailDto {
  @IsEmail()
  email: string;
}
