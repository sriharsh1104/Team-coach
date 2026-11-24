import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * The global ValidationPipe runs with `whitelist` + `forbidNonWhitelisted`,
 * so anything not declared here is rejected with a 400 rather than silently
 * reaching Prisma.
 */
export class ListOrgsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}

/**
 * Grant / revoke the 1-on-1 voice permission. Address the person by email
 * (what an admin actually has) or by user id; exactly one is required.
 */
export class SetDirectVoiceDto {
  @ValidateIf((o: SetDirectVoiceDto) => !o.userId)
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ValidateIf((o: SetDirectVoiceDto) => !o.email)
  @IsString()
  @MaxLength(64)
  userId?: string;

  @IsBoolean()
  enabled: boolean;
}

/**
 * Deleting a guild wipes its chat, media, stats, scrims, maps and every
 * membership with it, across an org the admin is not even in. So the name
 * has to be typed back: a mis-tap on the wrong row in a list cannot do this,
 * only a deliberate act can.
 */
export class DeleteOrgDto {
  @IsString()
  @MaxLength(200)
  confirmName: string;
}

/**
 * Block one account. The reason is shown to the blocked person at login, so
 * it is worth writing something they can act on.
 */
export class BlockUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

/**
 * Deleting an account erases its chat, media, stats and every membership
 * along with it. Same guard as deleting a guild: the email has to be typed
 * back, so a mis-tap on a member row cannot do this.
 */
export class DeleteUserDto {
  @IsString()
  @MaxLength(255)
  confirmEmail: string;
}
