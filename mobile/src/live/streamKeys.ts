import { Platform } from 'react-native';

export type LivePlatform = 'youtube' | 'twitch' | 'kick';

export type StreamPreset = {
  id: string;
  label: string;
  platform: LivePlatform;
  rtmpUrl: string;
  streamKey: string;
  title: string;
  bannerUri: string;
  /**
   * YouTube only — watch/live URL or video id so Go Live can pull public
   * YouTube Live Chat onto the on-screen overlay (needs YOUTUBE_DATA_API_KEY).
   */
  youtubeLiveUrl?: string;
};

export const LIVE_PLATFORMS: Array<{
  id: LivePlatform;
  label: string;
  defaultUrl: string;
  urlHint: string;
  keyHint: string;
}> = [
  {
    id: 'youtube',
    label: 'YouTube',
    defaultUrl: 'rtmp://a.rtmp.youtube.com/live2',
    urlHint: 'YouTube Stream URL',
    keyHint: 'YouTube Stream Key',
  },
  {
    id: 'twitch',
    label: 'Twitch',
    defaultUrl: 'rtmps://live.twitch.tv/app',
    urlHint: 'Twitch Ingest URL',
    keyHint: 'Twitch Stream Key',
  },
  {
    id: 'kick',
    label: 'Kick',
    defaultUrl: '',
    urlHint: 'Paste Server URL from Kick dashboard',
    keyHint: 'Kick Stream Key',
  },
];

const KEY_PREFIX = 'sacred.live.streamKey.';
const URL_PREFIX = 'sacred.live.rtmpUrl.';
const TITLE_PREFIX = 'sacred.live.title.';
const BANNER_PREFIX = 'sacred.live.banner.';
const PRESETS_KEY = 'sacred.live.presets.v1';
const ACTIVE_ID_KEY = 'sacred.live.activePresetId.';
const SELECTED_PLATFORMS_KEY = 'sacred.live.selectedPlatforms';

function secureStore() {
  if (Platform.OS === 'web') return null;
  return require('expo-secure-store') as typeof import('expo-secure-store');
}

async function loadString(key: string, fallback = ''): Promise<string> {
  const store = secureStore();
  if (!store) return fallback;
  return (await store.getItemAsync(key)) ?? fallback;
}

async function saveString(key: string, value: string): Promise<void> {
  const store = secureStore();
  if (!store) return;
  const trimmed = value.trim();
  if (!trimmed) await store.deleteItemAsync(key);
  else await store.setItemAsync(key, trimmed);
}

function newPresetId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultPresetLabel(platform: LivePlatform, index = 1): string {
  const name = LIVE_PLATFORMS.find((p) => p.id === platform)?.label ?? platform;
  return index <= 1 ? `${name} Main` : `${name} ${index}`;
}

export async function loadStreamKey(platform: LivePlatform): Promise<string> {
  return loadString(KEY_PREFIX + platform);
}

export async function saveStreamKey(
  platform: LivePlatform,
  key: string,
): Promise<void> {
  return saveString(KEY_PREFIX + platform, key);
}

export async function loadRtmpUrl(platform: LivePlatform): Promise<string> {
  const preset =
    LIVE_PLATFORMS.find((p) => p.id === platform)?.defaultUrl ?? '';
  return loadString(URL_PREFIX + platform, preset);
}

export async function saveRtmpUrl(
  platform: LivePlatform,
  url: string,
): Promise<void> {
  return saveString(URL_PREFIX + platform, url);
}

export async function loadStreamTitle(platform: LivePlatform): Promise<string> {
  return loadString(TITLE_PREFIX + platform);
}

export async function saveStreamTitle(
  platform: LivePlatform,
  title: string,
): Promise<void> {
  return saveString(TITLE_PREFIX + platform, title);
}

export async function loadStreamBannerUri(
  platform: LivePlatform,
): Promise<string> {
  return loadString(BANNER_PREFIX + platform);
}

export async function saveStreamBannerUri(
  platform: LivePlatform,
  uri: string,
): Promise<void> {
  return saveString(BANNER_PREFIX + platform, uri);
}

/** Seed one preset per platform from the older single-slot SecureStore keys. */
async function migrateLegacyPresets(): Promise<StreamPreset[]> {
  const seeded: StreamPreset[] = [];
  for (const p of LIVE_PLATFORMS) {
    const [rtmpUrl, streamKey, title, bannerUri] = await Promise.all([
      loadRtmpUrl(p.id),
      loadStreamKey(p.id),
      loadStreamTitle(p.id),
      loadStreamBannerUri(p.id),
    ]);
    // Always seed a default slot so the dropdown has something to select.
    seeded.push({
      id: newPresetId(),
      label: defaultPresetLabel(p.id),
      platform: p.id,
      rtmpUrl: rtmpUrl || p.defaultUrl,
      streamKey,
      title,
      bannerUri,
      youtubeLiveUrl: '',
    });
  }
  await saveAllPresets(seeded);
  return seeded;
}

export async function loadAllPresets(): Promise<StreamPreset[]> {
  const raw = await loadString(PRESETS_KEY);
  if (!raw) return migrateLegacyPresets();
  try {
    const parsed = JSON.parse(raw) as StreamPreset[];
    if (!Array.isArray(parsed) || parsed.length === 0) return migrateLegacyPresets();
    return parsed.filter(
      (p) =>
        p &&
        typeof p.id === 'string' &&
        typeof p.label === 'string' &&
        (p.platform === 'youtube' || p.platform === 'twitch' || p.platform === 'kick'),
    );
  } catch {
    return migrateLegacyPresets();
  }
}

export async function saveAllPresets(presets: StreamPreset[]): Promise<void> {
  const store = secureStore();
  if (!store) return;
  await store.setItemAsync(PRESETS_KEY, JSON.stringify(presets));
}

export async function loadPresetsForPlatform(
  platform: LivePlatform,
): Promise<StreamPreset[]> {
  const all = await loadAllPresets();
  return all.filter((p) => p.platform === platform);
}

export async function getActivePresetId(
  platform: LivePlatform,
): Promise<string | null> {
  const id = await loadString(ACTIVE_ID_KEY + platform);
  return id || null;
}

export async function setActivePresetId(
  platform: LivePlatform,
  id: string,
): Promise<void> {
  return saveString(ACTIVE_ID_KEY + platform, id);
}

/** Which platforms are checked for the next Go Live (1–3). */
export async function loadSelectedPlatforms(): Promise<LivePlatform[]> {
  const raw = await loadString(SELECTED_PLATFORMS_KEY);
  if (!raw) return ['youtube'];
  try {
    const parsed = JSON.parse(raw) as string[];
    const valid = parsed.filter(
      (p): p is LivePlatform =>
        p === 'youtube' || p === 'twitch' || p === 'kick',
    );
    return valid.length > 0 ? valid : ['youtube'];
  } catch {
    return ['youtube'];
  }
}

export async function saveSelectedPlatforms(
  platforms: LivePlatform[],
): Promise<void> {
  const unique = [...new Set(platforms)].filter(
    (p): p is LivePlatform =>
      p === 'youtube' || p === 'twitch' || p === 'kick',
  );
  await saveString(
    SELECTED_PLATFORMS_KEY,
    JSON.stringify(unique.length > 0 ? unique : ['youtube']),
  );
}

/**
 * Upsert a preset. Also mirrors URL/key/title/banner into the legacy
 * single-slot keys so older code paths still see the last-used values.
 */
export async function upsertPreset(preset: StreamPreset): Promise<StreamPreset[]> {
  const all = await loadAllPresets();
  const idx = all.findIndex((p) => p.id === preset.id);
  const next =
    idx >= 0
      ? all.map((p, i) => (i === idx ? preset : p))
      : [...all, preset];
  await saveAllPresets(next);
  await Promise.all([
    saveRtmpUrl(preset.platform, preset.rtmpUrl),
    saveStreamKey(preset.platform, preset.streamKey),
    saveStreamTitle(preset.platform, preset.title),
    saveStreamBannerUri(preset.platform, preset.bannerUri),
    setActivePresetId(preset.platform, preset.id),
  ]);
  return next;
}

export async function deletePreset(id: string): Promise<StreamPreset[]> {
  const all = await loadAllPresets();
  const target = all.find((p) => p.id === id);
  const next = all.filter((p) => p.id !== id);
  // Keep at least one empty slot per platform.
  if (target && !next.some((p) => p.platform === target.platform)) {
    const meta = LIVE_PLATFORMS.find((p) => p.id === target.platform)!;
    next.push({
      id: newPresetId(),
      label: defaultPresetLabel(target.platform),
      platform: target.platform,
      rtmpUrl: meta.defaultUrl,
      streamKey: '',
      title: '',
      bannerUri: '',
      youtubeLiveUrl: '',
    });
  }
  await saveAllPresets(next);
  return next;
}

export function createBlankPreset(
  platform: LivePlatform,
  label?: string,
  existingCount = 0,
): StreamPreset {
  const meta = LIVE_PLATFORMS.find((p) => p.id === platform)!;
  return {
    id: newPresetId(),
    label: label?.trim() || defaultPresetLabel(platform, existingCount + 1),
    platform,
    rtmpUrl: meta.defaultUrl,
    streamKey: '',
    title: '',
    bannerUri: '',
    youtubeLiveUrl: '',
  };
}
