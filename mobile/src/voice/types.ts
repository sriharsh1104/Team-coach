export type VoiceChannelStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface VoiceParticipant {
  id: string;
  name: string;
  /** True when this client has locally muted (deafened) that participant. */
  isLocallyMuted: boolean;
}

// Both the self-hosted (mediasoup) and hosted (LiveKit) implementations
// expose this same shape so VoiceChannelScreen doesn't need to know which
// one is active.
export interface VoiceChannelController {
  status: VoiceChannelStatus;
  errorMessage?: string;
  participants: VoiceParticipant[];
  isMuted: boolean;
  join: () => Promise<void>;
  leave: () => void;
  toggleMute: () => void;
  /** Mute/unmute another person in your own ears only (Discord-style). */
  toggleParticipantMute: (participantId: string) => void;
}
