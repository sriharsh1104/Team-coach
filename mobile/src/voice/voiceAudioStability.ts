import {
  AudioPresets,
  ConnectionQuality,
  Room,
  Track,
  type LocalAudioTrack,
} from 'livekit-client';

/**
 * Publish defaults tuned for talk-over-cellular / mid-range Android:
 * - speech bitrate (24 kbps) instead of music (48 kbps) so packets fit a
 *   weak uplink
 * - Opus RED on so lost packets can be reconstructed from redundancy
 * - DTX off — speech+DTX was chopping mid-words into a rumble on some
 *   Androids in this app
 */
export const STABLE_VOICE_PUBLISH = {
  audioPreset: AudioPresets.speech,
  dtx: false,
  red: true,
  forceStereo: false,
} as const;

/** Bitrate when the link is fine enough to carry clear speech. */
export const VOICE_BITRATE_GOOD = AudioPresets.speech.maxBitrate;
/** Bitrate when LiveKit reports Poor / Lost — smaller packets, more survive. */
export const VOICE_BITRATE_WEAK = AudioPresets.telephone.maxBitrate;

export function bitrateForConnectionQuality(quality: ConnectionQuality): number {
  switch (quality) {
    case ConnectionQuality.Poor:
    case ConnectionQuality.Lost:
      return VOICE_BITRATE_WEAK;
    default:
      return VOICE_BITRATE_GOOD;
  }
}

/**
 * Cap the local mic's RTP maxBitrate so weak uplinks stop shredding audio.
 * WebRTC's jitter buffer on the far side then has smaller, denser packets to
 * reassemble — speech stays choppy-but-intelligible instead of full dropouts.
 */
export async function applyMicBitrateForQuality(
  room: Room,
  quality: ConnectionQuality,
): Promise<number | null> {
  const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
  const track = pub?.track as LocalAudioTrack | undefined;
  const sender = track?.sender;
  if (!sender?.getParameters || !sender.setParameters) return null;

  const maxBitrate = bitrateForConnectionQuality(quality);
  const params = sender.getParameters();
  if (!params.encodings?.length) return null;

  let changed = false;
  for (const enc of params.encodings) {
    if (enc.maxBitrate !== maxBitrate) {
      enc.maxBitrate = maxBitrate;
      changed = true;
    }
  }
  if (!changed) return maxBitrate;

  try {
    await sender.setParameters(params);
    return maxBitrate;
  } catch (err) {
    console.warn('mic bitrate adapt failed:', err);
    return null;
  }
}
