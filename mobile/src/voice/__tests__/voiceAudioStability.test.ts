import { ConnectionQuality } from 'livekit-client';
import {
  STABLE_VOICE_PUBLISH,
  VOICE_BITRATE_GOOD,
  VOICE_BITRATE_WEAK,
  applyMicBitrateForQuality,
  bitrateForConnectionQuality,
} from '../voiceAudioStability';

describe('voiceAudioStability', () => {
  it('publishes speech + RED without DTX', () => {
    expect(STABLE_VOICE_PUBLISH.audioPreset.maxBitrate).toBe(VOICE_BITRATE_GOOD);
    expect(STABLE_VOICE_PUBLISH.red).toBe(true);
    expect(STABLE_VOICE_PUBLISH.dtx).toBe(false);
    expect(STABLE_VOICE_PUBLISH.forceStereo).toBe(false);
  });

  it('drops to telephone bitrate when the link is poor or lost', () => {
    expect(bitrateForConnectionQuality(ConnectionQuality.Poor)).toBe(
      VOICE_BITRATE_WEAK,
    );
    expect(bitrateForConnectionQuality(ConnectionQuality.Lost)).toBe(
      VOICE_BITRATE_WEAK,
    );
    expect(bitrateForConnectionQuality(ConnectionQuality.Good)).toBe(
      VOICE_BITRATE_GOOD,
    );
    expect(bitrateForConnectionQuality(ConnectionQuality.Excellent)).toBe(
      VOICE_BITRATE_GOOD,
    );
  });

  it('rewrites the mic sender maxBitrate when quality changes', async () => {
    const encodings = [{ maxBitrate: VOICE_BITRATE_GOOD }];
    const setParameters = jest.fn().mockResolvedValue(undefined);
    const room = {
      localParticipant: {
        getTrackPublication: () => ({
          track: {
            sender: {
              getParameters: () => ({ encodings }),
              setParameters,
            },
          },
        }),
      },
    };

    const bitrate = await applyMicBitrateForQuality(
      room as any,
      ConnectionQuality.Poor,
    );

    expect(bitrate).toBe(VOICE_BITRATE_WEAK);
    expect(encodings[0].maxBitrate).toBe(VOICE_BITRATE_WEAK);
    expect(setParameters).toHaveBeenCalled();
  });

  it('no-ops when the bitrate is already correct', async () => {
    const encodings = [{ maxBitrate: VOICE_BITRATE_WEAK }];
    const setParameters = jest.fn();
    const room = {
      localParticipant: {
        getTrackPublication: () => ({
          track: {
            sender: {
              getParameters: () => ({ encodings }),
              setParameters,
            },
          },
        }),
      },
    };

    const bitrate = await applyMicBitrateForQuality(
      room as any,
      ConnectionQuality.Lost,
    );

    expect(bitrate).toBe(VOICE_BITRATE_WEAK);
    expect(setParameters).not.toHaveBeenCalled();
  });
});
