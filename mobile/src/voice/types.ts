export type VoiceChannelStatus = 'idle' | 'connecting' | 'connected' | 'error';

export type ConnectionQualityLevel = 'excellent' | 'good' | 'poor' | 'lost' | 'unknown';

export interface VoiceParticipant {
  id: string;
  name: string;
  /** True when this client has locally muted (deafened) that participant. */
  isLocallyMuted: boolean;
  /** True when LiveKit detects this participant is actively speaking. */
  isSpeaking: boolean;
  /** True when this participant has raised their hand. */
  isHandRaised: boolean;
  /** Local playback volume for this participant (0–1). */
  localVolume: number;
  /** Connection quality for this participant. */
  connectionQuality: ConnectionQualityLevel;
}

// Both the self-hosted (mediasoup) and hosted (LiveKit) implementations
// expose this same shape so VoiceChannelScreen doesn't need to know which
// one is active.
export interface VoiceChannelController {
  status: VoiceChannelStatus;
  errorMessage?: string;
  participants: VoiceParticipant[];
  isMuted: boolean;
  /** Whether the local user has raised their hand. */
  isLocalHandRaised: boolean;
  /** Whether the local user is deafened (all remote audio muted + mic muted). */
  isDeafened: boolean;
  /** Whether push-to-talk mode is active (mic only opens while holding PTT). */
  isPushToTalk: boolean;
  join: () => Promise<void>;
  leave: () => void;
  toggleMute: () => void;
  /** Mute/unmute another person in your own ears only (Discord-style). Kept for backwards compat — calls setParticipantVolume(id, 0). */
  toggleParticipantMute: (participantId: string) => void;
  /** Toggle local hand raise on/off, broadcasting to all participants. */
  toggleHandRaise: () => void;
  /** Set per-participant local playback volume (0–1). */
  setParticipantVolume: (id: string, volume: number) => void;
  /** Kick a participant from the voice channel (admin/coach only). */
  kickParticipant: (id: string) => void;
  /** Toggle deafen: mutes all remote audio + local mic. Un-deafen restores. */
  toggleDeafen: () => void;
  /** Toggle push-to-talk mode on/off. When entering PTT mode, mic is muted immediately. */
  togglePushToTalk: () => void;
  /** Unmute mic while holding in PTT mode. */
  pttStart: () => void;
  /** Re-mute mic when releasing in PTT mode. */
  pttStop: () => void;
}
