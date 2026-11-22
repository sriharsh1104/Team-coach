import { Audio } from 'expo-av';
import { playVoiceCue, preloadVoiceCues, unloadVoiceCues } from '../voiceCues';

const createAsync = Audio.Sound.createAsync as jest.Mock;

/** Drains the microtask queue — loading a cue is several promise hops deep. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

async function loadedSound() {
  return (await createAsync.mock.results[0].value).sound;
}

describe('voiceCues', () => {
  beforeEach(async () => {
    await unloadVoiceCues();
    createAsync.mockClear();
  });

  it('plays a cue, and replays from the start on the next one', async () => {
    playVoiceCue('join');
    await flush();

    expect(createAsync).toHaveBeenCalledTimes(1);
    const sound = await loadedSound();
    // replay, not play: two people joining back to back must each be heard
    // from the top rather than the second one resuming a finished clip.
    expect(sound.replayAsync).toHaveBeenCalledTimes(1);

    playVoiceCue('join');
    await flush();
    expect(sound.replayAsync).toHaveBeenCalledTimes(2);
    expect(createAsync).toHaveBeenCalledTimes(1);
  });

  it('does not load the same clip twice when several cues race', async () => {
    // Three people leaving at once must not build three Sound objects.
    playVoiceCue('leave');
    playVoiceCue('leave');
    playVoiceCue('leave');
    await flush();

    expect(createAsync).toHaveBeenCalledTimes(1);
  });

  it('preloads both clips so the first arrival is not silent', async () => {
    preloadVoiceCues();
    await flush();

    expect(createAsync).toHaveBeenCalledTimes(2);
  });

  it('plays without reloading once preloaded', async () => {
    preloadVoiceCues();
    await flush();
    createAsync.mockClear();

    playVoiceCue('join');
    playVoiceCue('leave');
    await flush();

    expect(createAsync).not.toHaveBeenCalled();
  });

  it('survives a clip that fails to load', async () => {
    createAsync.mockRejectedValueOnce(new Error('decoder busy'));
    // A missing beep must never bubble up into the call.
    expect(() => playVoiceCue('join')).not.toThrow();
    await flush();
  });

  it('retries the load after a failure instead of staying silent forever', async () => {
    createAsync.mockRejectedValueOnce(new Error('decoder busy'));
    playVoiceCue('join');
    await flush();
    createAsync.mockClear();

    playVoiceCue('join');
    await flush();

    expect(createAsync).toHaveBeenCalledTimes(1);
  });

  it('reloads after an unload', async () => {
    preloadVoiceCues();
    await flush();
    await unloadVoiceCues();
    createAsync.mockClear();

    playVoiceCue('join');
    await flush();

    expect(createAsync).toHaveBeenCalledTimes(1);
  });
});
