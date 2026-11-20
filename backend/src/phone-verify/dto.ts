import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class StartPhoneVerifyDto {
  /** Digits with optional +, spaces, dashes, brackets — normalised server-side. */
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  @Matches(/^[+\d][\d\s\-()]*$/, { message: 'Enter a valid phone number' })
  phone: string;
}

export class ConfirmPhoneCodeDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code from Telegram' })
  code: string;
}
