import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const VOICE_ROOMS = ['team', 'guild'] as const;
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
