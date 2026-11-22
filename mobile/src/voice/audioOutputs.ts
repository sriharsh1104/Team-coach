import type { AppIconName } from '../ui/AppIcon';

/**
 * Audio routes LiveKit's AudioSession can hand us.
 *
 * Android reports the real hardware routes. iOS can only report "default"
 * (whatever the OS picked — receiver, wired, AirPods, CarPlay...) and
 * "force_speaker", so the picker there offers those two plus the system
 * route sheet (AVRoutePickerView) for everything else.
 */
export type AudioOutputId =
  | 'speaker'
  | 'earpiece'
  | 'headset'
  | 'bluetooth'
  | 'default'
  | 'force_speaker';

const KNOWN: AudioOutputId[] = [
  'speaker',
  'earpiece',
  'headset',
  'bluetooth',
  'default',
  'force_speaker',
];

export function isAudioOutputId(value: unknown): value is AudioOutputId {
  return typeof value === 'string' && (KNOWN as string[]).includes(value);
}

/**
 * Same order LiveKit uses when it picks a route on its own, so "Auto" in the
 * UI and the OS agree on what is currently playing. A wired headset or
 * bluetooth earpiece outranks the loudspeaker; the phone's own earpiece is
 * the last resort.
 */
const PREFERENCE: AudioOutputId[] = [
  'bluetooth',
  'headset',
  'speaker',
  'earpiece',
  'force_speaker',
  'default',
];

/** Which route is actually playing, given what the OS offers. */
export function resolveActiveOutput(
  outputs: AudioOutputId[],
  manual: AudioOutputId | null,
): AudioOutputId | null {
  if (manual && outputs.includes(manual)) return manual;
  for (const id of PREFERENCE) {
    if (outputs.includes(id)) return id;
  }
  return outputs[0] ?? null;
}

/**
 * A manual pick stops being meaningful once that device is gone (headphones
 * unplugged, bluetooth earpiece out of range). Returning null hands routing
 * back to the automatic order instead of leaving the UI pointing at a device
 * that is not there.
 */
export function keepManualSelection(
  outputs: AudioOutputId[],
  manual: AudioOutputId | null,
): AudioOutputId | null {
  if (!manual) return null;
  return outputs.includes(manual) ? manual : null;
}

export function audioOutputLabel(id: AudioOutputId): string {
  switch (id) {
    case 'speaker':
    case 'force_speaker':
      return 'Speaker';
    case 'earpiece':
      return 'Phone';
    case 'headset':
      return 'Headphones';
    case 'bluetooth':
      return 'Bluetooth';
    case 'default':
      return 'Automatic';
  }
}

export function audioOutputIcon(id: AudioOutputId | null): AppIconName {
  switch (id) {
    case 'bluetooth':
      return 'bluetooth';
    case 'headset':
      return 'headset';
    case 'earpiece':
      return 'ear';
    default:
      return 'volume-high';
  }
}

/**
 * Sort for the picker sheet: the routes people reach for most sit at the top
 * and the list does not re-order itself as devices come and go.
 */
export function sortAudioOutputs(outputs: AudioOutputId[]): AudioOutputId[] {
  const order = new Map(PREFERENCE.map((id, i) => [id, i]));
  return [...outputs].sort(
    (a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99),
  );
}
