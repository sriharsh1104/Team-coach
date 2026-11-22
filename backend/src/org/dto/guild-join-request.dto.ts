import { IsBoolean, IsString, MaxLength } from 'class-validator';

/** Ask an org's leadership to let you into their guild. */
export class RequestGuildJoinDto {
  @IsString()
  @MaxLength(64)
  orgId: string;
}

/** Owner / guild leadership accepting or rejecting one request. */
export class DecideGuildJoinDto {
  @IsString()
  @MaxLength(64)
  requestId: string;

  @IsBoolean()
  accept: boolean;
}

export class CancelGuildJoinDto {
  @IsString()
  @MaxLength(64)
  requestId: string;
}
