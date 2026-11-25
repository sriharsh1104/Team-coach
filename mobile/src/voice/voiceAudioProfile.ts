import { AndroidAudioTypePresets } from '@livekit/react-native';
import { isLiveStreaming } from '../media/liveStreamer';

/** Process-wide: true while a voice call is connected or connecting. */
let inCall = false;

export function setVoiceCallActive(active: boolean) {
  inCall = active;
}

export function isVoiceCallActive() {
  return inCall;
}

/**
 * Which Android audio profile a call should play through.
 *
 * Normally `communication` — that is what gives a call its earpiece/speaker
 * routing and the call-tuned echo canceller.
 *
 * While Go Live is streaming we switch to `media`. Android's playback capture
 * (the thing that mixes game sound into the broadcast) is forbidden by the
 * platform from capturing `USAGE_VOICE_COMMUNICATION`, so a call played the
 * normal way is silent for viewers no matter what we do on the encoder side.
 * Played as media, friends' voices are captured along with the game.
 *
 * The trade-off is real: on loudspeaker the call loses its call-mode echo
 * cancellation, so the streamer should be on headphones. The profile is
 * therefore only swapped while actually live.
 *
 * Only read when the audio session is configured (call join): WebRTC builds
 * its AudioTrack with these attributes once, so going live mid-call cannot
 * retro-fit an already-playing call — that call has to be rejoined.
 */
export function callAudioTypeOptions() {
  return isLiveStreaming()
    ? AndroidAudioTypePresets.media
    : AndroidAudioTypePresets.communication;
}
