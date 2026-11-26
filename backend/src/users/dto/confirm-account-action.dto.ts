import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/** Shared body for self-service deactivate / delete. */
export class ConfirmAccountActionDto {
  @IsEmail()
  confirmEmail!: string;

  /** Required when the account has a password; Google-only accounts skip it. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
