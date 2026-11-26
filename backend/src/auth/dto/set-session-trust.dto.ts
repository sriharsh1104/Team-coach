import { IsBoolean } from 'class-validator';

export class SetSessionTrustDto {
  @IsBoolean()
  trusted: boolean;
}
