export type VoiceChannelStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface VoiceParticipant {
  id: string;
  name: string;
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
}
