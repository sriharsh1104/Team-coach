import { Audio } from 'expo-av';

export type ArcadeSfx = 'punch' | 'kick' | 'boost' | 'super' | 'ko';

/**
 * The arcade's sound effects.
 *
 * The original synthesises these live with Tone.js — a membrane synth whose
 * pitch drops three octaves onto the note as it decays. There is no synth in
 * a React Native app, so the same hits were rendered offline from the same
 * model, at the same notes, and bundled as clips of a few kilobytes each.
 */
const SOURCES: Record<ArcadeSfx, number> = {
  punch: require('../../../assets/sounds/arcade-punch.wav'),
  kick: require('../../../assets/sounds/arcade-kick.wav'),
  boost: require('../../../assets/sounds/arcade-boost.wav'),
  super: require('../../../assets/sounds/arcade-super.wav'),
  ko: require('../../../assets/sounds/arcade-ko.wav'),
};

const VOLUME = 0.7;

const loaded = new Map<ArcadeSfx, Audio.Sound>();
const loading = new Map<ArcadeSfx, Promise<Audio.Sound | null>>();
let enabled = true;

/** The header's speaker button. Muting also stops anything mid-flight. */
export function setArcadeSoundEnabled(next: boolean): void {
  enabled = next;
  if (!next) {
    for (const sound of loaded.values()) void sound.stopAsync().catch(() => undefined);
  }
}

export function arcadeSoundEnabled(): boolean {
  return enabled;
}

function getSound(name: ArcadeSfx): Promise<Audio.Sound | null> {
  const ready = loaded.get(name);
  if (ready) return Promise.resolve(ready);

  const inFlight = loading.get(name);
  if (inFlight) return inFlight;

  const task = Audio.Sound.createAsync(SOURCES[name], { volume: VOLUME })
    .then(({ sound }) => {
      loaded.set(name, sound);
      return sound;
    })
    .catch(() => null)
    .finally(() => {
      loading.delete(name);
    });

  loading.set(name, task);
  return task;
}

/**
 * Fire-and-forget: a hit that cannot make a noise must never interrupt the
 * frame that triggered it, so every failure here is swallowed.
 */
export function playArcadeSfx(name: ArcadeSfx): void {
  if (!enabled) return;
  void getSound(name)
    .then((sound) => sound?.replayAsync())
    .catch(() => undefined);
}

/** Warms the decoder so the first punch of a match is not silent. */
export function preloadArcadeSfx(): void {
  for (const name of Object.keys(SOURCES) as ArcadeSfx[]) void getSound(name);
}

export async function unloadArcadeSfx(): Promise<void> {
  const sounds = [...loaded.values()];
  loaded.clear();
  await Promise.all(sounds.map((s) => s.unloadAsync().catch(() => undefined)));
}
