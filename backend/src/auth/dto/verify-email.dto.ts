import { IsString, Matches } from 'class-validator';

export class VerifyEmailDto {
  @IsString()
  challengeToken: string;

  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' })
  code: string;
}
