import {
  audioOutputIcon,
  audioOutputLabel,
  isAudioOutputId,
  keepManualSelection,
  nextToggleOutput,
  preferredCallDefault,
  resolveActiveOutput,
  sortAudioOutputs,
  type AudioOutputId,
} from '../audioOutputs';

describe('audio output routing', () => {
  it('ignores route names the platform may add later', () => {
    expect(isAudioOutputId('bluetooth')).toBe(true);
    expect(isAudioOutputId('carplay')).toBe(false);
    expect(isAudioOutputId(undefined)).toBe(false);
  });

  describe('resolveActiveOutput', () => {
    it('prefers bluetooth / headset, then earpiece over speaker', () => {
      expect(
        resolveActiveOutput(['speaker', 'earpiece', 'bluetooth'], null),
      ).toBe('bluetooth');
      expect(resolveActiveOutput(['speaker', 'earpiece'], null)).toBe(
        'earpiece',
      );
      expect(resolveActiveOutput(['earpiece'], null)).toBe('earpiece');
    });

    it('a manual pick wins over the automatic order', () => {
      expect(
        resolveActiveOutput(['speaker', 'earpiece', 'bluetooth'], 'earpiece'),
      ).toBe('earpiece');
    });

    it('falls back to automatic when the picked device is gone', () => {
      // Bluetooth earpiece walked out of range mid-call → earpiece default.
      expect(
        resolveActiveOutput(['speaker', 'earpiece'], 'bluetooth'),
      ).toBe('earpiece');
    });

    it('has nothing to report before the audio session starts', () => {
      expect(resolveActiveOutput([], null)).toBeNull();
    });
  });

  describe('preferredCallDefault', () => {
    it('defaults to the phone earpiece when nothing is plugged in', () => {
      expect(preferredCallDefault(['speaker', 'earpiece'])).toBe('earpiece');
    });

    it('keeps an external device when one is connected', () => {
      expect(
        preferredCallDefault(['speaker', 'earpiece', 'bluetooth']),
      ).toBe('bluetooth');
    });
  });

  describe('nextToggleOutput', () => {
    it('flips earpiece ↔ speaker when those are the only options', () => {
      expect(nextToggleOutput(['speaker', 'earpiece'], 'earpiece')).toBe(
        'speaker',
      );
      expect(nextToggleOutput(['speaker', 'earpiece'], 'speaker')).toBe(
        'earpiece',
      );
    });

    it('returns null when an external device needs a menu', () => {
      expect(
        nextToggleOutput(['speaker', 'earpiece', 'bluetooth'], 'earpiece'),
      ).toBeNull();
      expect(
        nextToggleOutput(['speaker', 'earpiece', 'headset'], 'speaker'),
      ).toBeNull();
    });
  });

  describe('keepManualSelection', () => {
    it('keeps a pick that is still plugged in', () => {
      expect(keepManualSelection(['speaker', 'headset'], 'headset')).toBe(
        'headset',
      );
    });

    it('clears a pick whose device disappeared', () => {
      expect(keepManualSelection(['speaker', 'earpiece'], 'headset')).toBeNull();
    });

    it('is a no-op when routing is already automatic', () => {
      expect(keepManualSelection(['speaker'], null)).toBeNull();
    });
  });

  it('orders the picker with phone / speaker first, then externals', () => {
    const outputs: AudioOutputId[] = [
      'earpiece',
      'speaker',
      'bluetooth',
      'headset',
    ];
    expect(sortAudioOutputs(outputs)).toEqual([
      'earpiece',
      'speaker',
      'headset',
      'bluetooth',
    ]);
  });

  it('labels and icons every route it can report', () => {
    const all: AudioOutputId[] = [
      'speaker',
      'earpiece',
      'headset',
      'bluetooth',
      'default',
      'force_speaker',
    ];
    for (const id of all) {
      expect(audioOutputLabel(id)).toBeTruthy();
      expect(audioOutputIcon(id)).toBeTruthy();
    }
    expect(audioOutputLabel('force_speaker')).toBe('Speaker');
    expect(audioOutputLabel('earpiece')).toBe('Phone');
    expect(audioOutputIcon(null)).toBe('ear');
    // Loudspeaker box — must stay distinct from volume-high (deafen).
    expect(audioOutputIcon('speaker')).toBe('speaker');
    expect(audioOutputIcon('force_speaker')).toBe('speaker');
  });
});
