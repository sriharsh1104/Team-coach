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

export function isExternalOutput(id: AudioOutputId): boolean {
  return id === 'bluetooth' || id === 'headset';
}

export function isSpeakerOutput(id: AudioOutputId): boolean {
  return id === 'speaker' || id === 'force_speaker';
}

export function isEarpieceOutput(id: AudioOutputId): boolean {
  return id === 'earpiece' || id === 'default';
}

/**
 * Call-style preference: plugged-in headset / bluetooth first, then the
 * phone earpiece (default for a voice call), loudspeaker last.
 */
const PREFERENCE: AudioOutputId[] = [
  'bluetooth',
  'headset',
  'earpiece',
  'default',
  'speaker',
  'force_speaker',
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

/**
 * When only phone earpiece + speaker are available, tapping the single
 * control flips between them. Returns null when a menu is needed instead
 * (bluetooth / wired headset present, or only one route).
 */
export function nextToggleOutput(
  outputs: AudioOutputId[],
  active: AudioOutputId | null,
): AudioOutputId | null {
  if (outputs.some(isExternalOutput)) return null;
  const speaker = outputs.find(isSpeakerOutput) ?? null;
  const ear = outputs.find(isEarpieceOutput) ?? null;
  if (speaker && ear) {
    if (active && isSpeakerOutput(active)) return ear;
    return speaker;
  }
  // Fallback: flip to the other available route if there are exactly two.
  if (outputs.length === 2 && active) {
    return outputs.find((id) => id !== active) ?? null;
  }
  return null;
}

/** Preferred call default when no external device is connected. */
export function preferredCallDefault(
  outputs: AudioOutputId[],
): AudioOutputId | null {
  if (outputs.some(isExternalOutput)) {
    return resolveActiveOutput(outputs, null);
  }
  return (
    outputs.find(isEarpieceOutput) ??
    outputs.find(isSpeakerOutput) ??
    outputs[0] ??
    null
  );
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
      return 'Phone';
  }
}

export function audioOutputIcon(id: AudioOutputId | null): AppIconName {
  switch (id) {
    case 'bluetooth':
      return 'bluetooth';
    case 'headset':
      return 'headset';
    case 'earpiece':
    case 'default':
      return 'ear';
    case 'speaker':
    case 'force_speaker':
      // Loudspeaker box — not volume-high (that icon is deafen / hear-others).
      return 'speaker';
    default:
      return 'ear';
  }
}

/**
 * Sort for the picker sheet: earpiece / speaker first (the everyday
 * toggle), then external devices.
 */
export function sortAudioOutputs(outputs: AudioOutputId[]): AudioOutputId[] {
  const order = new Map(
    (
      [
        'earpiece',
        'default',
        'speaker',
        'force_speaker',
        'headset',
        'bluetooth',
      ] as AudioOutputId[]
    ).map((id, i) => [id, i]),
  );
  return [...outputs].sort(
    (a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99),
  );
}
