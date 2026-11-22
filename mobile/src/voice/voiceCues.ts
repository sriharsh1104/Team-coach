import { Audio } from 'expo-av';

export type VoiceCue = 'join' | 'leave';

/**
 * Short beeps played when someone enters or leaves the channel.
 *
 * Two steps up for an arrival, two steps down for a departure — the shape is
 * what you actually recognise mid-game, not the pitch. They are bundled WAVs
 * rather than the native `playCue` used for hand-raise, because that one is
 * Android-only and has a single sound, so it can't tell joins from leaves.
 */
const SOURCES: Record<VoiceCue, number> = {
  join: require('../../assets/sounds/voice-join.wav'),
  leave: require('../../assets/sounds/voice-leave.wav'),
};

/** Quiet enough to sit under conversation rather than interrupt it. */
const CUE_VOLUME = 0.5;

const loaded = new Map<VoiceCue, Audio.Sound>();
const loading = new Map<VoiceCue, Promise<Audio.Sound | null>>();

async function getSound(cue: VoiceCue): Promise<Audio.Sound | null> {
  const ready = loaded.get(cue);
  if (ready) return ready;

  const inFlight = loading.get(cue);
  if (inFlight) return inFlight;

  const task = Audio.Sound.createAsync(SOURCES[cue], { volume: CUE_VOLUME })
    .then(({ sound }) => {
      loaded.set(cue, sound);
      return sound;
    })
    .catch((err) => {
      console.warn(`voice cue "${cue}" failed to load:`, err);
      return null;
    })
    .finally(() => {
      loading.delete(cue);
    });

  loading.set(cue, task);
  return task;
}

/**
 * Fire-and-forget. A cue that can't play must never disturb the call, so
 * every failure here is swallowed.
 */
export function playVoiceCue(cue: VoiceCue): void {
  void getSound(cue)
    .then((sound) => sound?.replayAsync())
    .catch(() => undefined);
}

/**
 * Loads both clips so the first join of a session isn't silent while the
 * decoder warms up. Call it when a voice session starts.
 */
export function preloadVoiceCues(): void {
  void getSound('join');
  void getSound('leave');
}

/** Frees both clips. Called when the last voice session ends. */
export async function unloadVoiceCues(): Promise<void> {
  const sounds = [...loaded.values()];
  loaded.clear();
  await Promise.all(
    sounds.map((s) => s.unloadAsync().catch(() => undefined)),
  );
}
