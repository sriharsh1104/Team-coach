import {
  audioOutputIcon,
  audioOutputLabel,
  isAudioOutputId,
  keepManualSelection,
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
    it('matches the order the OS routes on its own (bluetooth over speaker)', () => {
      expect(
        resolveActiveOutput(['speaker', 'earpiece', 'bluetooth'], null),
      ).toBe('bluetooth');
      expect(resolveActiveOutput(['speaker', 'earpiece'], null)).toBe('speaker');
      expect(resolveActiveOutput(['earpiece'], null)).toBe('earpiece');
    });

    it('a manual pick wins over the automatic order', () => {
      expect(
        resolveActiveOutput(['speaker', 'earpiece', 'bluetooth'], 'earpiece'),
      ).toBe('earpiece');
    });

    it('falls back to automatic when the picked device is gone', () => {
      // Bluetooth earpiece walked out of range mid-call.
      expect(
        resolveActiveOutput(['speaker', 'earpiece'], 'bluetooth'),
      ).toBe('speaker');
    });

    it('has nothing to report before the audio session starts', () => {
      expect(resolveActiveOutput([], null)).toBeNull();
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

  it('orders the picker so the common routes sit on top', () => {
    const outputs: AudioOutputId[] = ['earpiece', 'speaker', 'bluetooth', 'headset'];
    expect(sortAudioOutputs(outputs)).toEqual([
      'bluetooth',
      'headset',
      'speaker',
      'earpiece',
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
    // iOS's two routes must not read as jargon in the UI.
    expect(audioOutputLabel('force_speaker')).toBe('Speaker');
    expect(audioOutputLabel('earpiece')).toBe('Phone');
    expect(audioOutputIcon(null)).toBe('volume-high');
  });
});
