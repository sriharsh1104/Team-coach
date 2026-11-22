import { Platform } from 'react-native';

export type LivePlatform = 'youtube' | 'twitch' | 'kick';

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
