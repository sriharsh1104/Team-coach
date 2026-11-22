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

function secureStore() {
  if (Platform.OS === 'web') return null;
  return require('expo-secure-store') as typeof import('expo-secure-store');
}

export async function loadStreamKey(platform: LivePlatform): Promise<string> {
  const store = secureStore();
  if (!store) return '';
  return (await store.getItemAsync(KEY_PREFIX + platform)) ?? '';
}

export async function saveStreamKey(
  platform: LivePlatform,
  key: string,
): Promise<void> {
  const store = secureStore();
  if (!store) return;
  const trimmed = key.trim();
  if (!trimmed) await store.deleteItemAsync(KEY_PREFIX + platform);
  else await store.setItemAsync(KEY_PREFIX + platform, trimmed);
}

export async function loadRtmpUrl(platform: LivePlatform): Promise<string> {
  const store = secureStore();
  const preset =
    LIVE_PLATFORMS.find((p) => p.id === platform)?.defaultUrl ?? '';
  if (!store) return preset;
  return (await store.getItemAsync(URL_PREFIX + platform)) ?? preset;
}

export async function saveRtmpUrl(
  platform: LivePlatform,
  url: string,
): Promise<void> {
  const store = secureStore();
  if (!store) return;
  const trimmed = url.trim();
  if (!trimmed) await store.deleteItemAsync(URL_PREFIX + platform);
  else await store.setItemAsync(URL_PREFIX + platform, trimmed);
}
