import { IsOptional, IsString, Matches } from 'class-validator';

export class TwoFactorVerifyDto {
  @IsString()
  challengeToken: string;

  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' })
  code?: string;

  @IsOptional()
  @IsString()
  backupCode?: string;
}
