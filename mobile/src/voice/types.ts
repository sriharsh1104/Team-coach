export type VoiceChannelStatus = 'idle' | 'connecting' | 'connected' | 'error';

export type ConnectionQualityLevel = 'excellent' | 'good' | 'poor' | 'lost' | 'unknown';

export interface VoiceParticipant {
  id: string;
  name: string;
  /** Profile photo shown as a small circular avatar in the participant list. */
  avatarUrl?: string | null;
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
  /** Guild voice: a host muted this person (or listen-only is on). */
  isHostMuted?: boolean;
  /** Guild voice: owner / coach / guild leader. */
  isModerator?: boolean;
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
  // ---- Guild voice (self-hosted only; undefined on team / hosted voice) ----
  /** Which room this session is in. */
  room?: 'team' | 'guild';
  /** You are a host: can mute/unmute everyone and remove people. */
  canModerate?: boolean;
  /** A host muted you — your mic is silent for others until they unmute you. */
  isHostMuted?: boolean;
  /** "Mute all" is on: only hosts (and people they unmuted) can speak. */
  isListenOnly?: boolean;
  /** People in the room right now / maximum allowed. */
  roomCount?: number;
  roomMax?: number;
  /** Host: silence everyone except hosts. */
  muteAll?: () => void;
  /** Host: let everyone talk again. */
  unmuteAll?: () => void;
  /** Host: mute or unmute one person for the whole room. */
  setParticipantHostMuted?: (id: string, muted: boolean) => void;
  /** Toggle push-to-talk mode on/off. When entering PTT mode, mic is muted immediately. */
  togglePushToTalk: () => void;
  /** Unmute mic while holding in PTT mode. */
  pttStart: () => void;
  /** Re-mute mic when releasing in PTT mode. */
  pttStop: () => void;
}
