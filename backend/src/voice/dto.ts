import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const VOICE_ROOMS = ['team', 'guild'] as const;

/** Cap on one ping so it stays a nudge to friends, not a broadcast. */
export const VOICE_INVITE_MAX_TARGETS = 20;
export type VoiceRoomName = (typeof VOICE_ROOMS)[number];

export class VoiceModerateDto {
  @IsIn(VOICE_ROOMS)
  room: VoiceRoomName;

  @IsIn(['muteAll', 'unmuteAll', 'mute', 'unmute', 'kick'])
  action: 'muteAll' | 'unmuteAll' | 'mute' | 'unmute' | 'kick';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  userId?: string;
}

/**
 * "Ping to join" — nudge specific teammates that you are waiting in voice.
 * Team room only: guild voice is org-wide and would be a megaphone.
 */
export class VoiceInviteDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(VOICE_INVITE_MAX_TARGETS)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  userIds: string[];
}
