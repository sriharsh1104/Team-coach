import { IsString } from 'class-validator';

export class TwoFactorSetupDto {
  @IsString()
  password: string;
}
