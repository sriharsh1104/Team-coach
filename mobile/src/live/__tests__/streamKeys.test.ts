import * as SecureStore from 'expo-secure-store';
import {
  createBlankPreset,
  deletePreset,
  getLiveCredentialsOwner,
  loadAllPresets,
  loadPresetsForPlatform,
  setLiveCredentialsOwner,
  upsertPreset,
} from '../streamKeys';

const USER_A = 'userA';
const USER_B = 'userB';

async function clearUser(userId: string) {
  await SecureStore.deleteItemAsync(`sacred.live.presets.v1.u.${userId}`);
  await SecureStore.deleteItemAsync(
    `sacred.live.selectedPlatforms.u.${userId}`,
  );
  for (const p of ['youtube', 'twitch', 'kick'] as const) {
    await SecureStore.deleteItemAsync(`sacred.live.rtmpUrl.${p}.u.${userId}`);
    await SecureStore.deleteItemAsync(`sacred.live.streamKey.${p}.u.${userId}`);
    await SecureStore.deleteItemAsync(`sacred.live.title.${p}.u.${userId}`);
    await SecureStore.deleteItemAsync(`sacred.live.banner.${p}.u.${userId}`);
    await SecureStore.deleteItemAsync(
      `sacred.live.activePresetId.${p}.u.${userId}`,
    );
  }
}

describe('streamKeys presets', () => {
  beforeEach(async () => {
    setLiveCredentialsOwner(USER_A);
    await clearUser(USER_A);
    await clearUser(USER_B);
    await SecureStore.deleteItemAsync('sacred.live.presets.v1');
    for (const p of ['youtube', 'twitch', 'kick'] as const) {
      await SecureStore.deleteItemAsync(`sacred.live.rtmpUrl.${p}`);
      await SecureStore.deleteItemAsync(`sacred.live.streamKey.${p}`);
      await SecureStore.deleteItemAsync(`sacred.live.title.${p}`);
      await SecureStore.deleteItemAsync(`sacred.live.banner.${p}`);
      await SecureStore.deleteItemAsync(`sacred.live.activePresetId.${p}`);
    }
  });

  afterEach(() => {
    setLiveCredentialsOwner(null);
  });

  it('migrates empty storage into one preset per platform', async () => {
    const all = await loadAllPresets();
    expect(all.map((p) => p.platform).sort()).toEqual(['kick', 'twitch', 'youtube']);
    const yt = await loadPresetsForPlatform('youtube');
    expect(yt).toHaveLength(1);
    expect(yt[0].rtmpUrl).toContain('youtube.com');
  });

  it('saves multiple named options for the same platform', async () => {
    await loadAllPresets();

    const second = createBlankPreset('youtube', 'Scrim Alt', 1);
    second.rtmpUrl = 'rtmp://b.rtmp.youtube.com/live2';
    second.streamKey = 'key-2';
    await upsertPreset(second);

    const third = createBlankPreset('youtube', 'Coach Channel', 2);
    third.streamKey = 'key-3';
    await upsertPreset(third);

    const yt = await loadPresetsForPlatform('youtube');
    expect(yt.length).toBeGreaterThanOrEqual(3);
    expect(yt.map((p) => p.label)).toEqual(
      expect.arrayContaining(['Scrim Alt', 'Coach Channel']),
    );
  });

  it('keeps at least one preset after delete', async () => {
    const only = createBlankPreset('twitch', 'Only');
    await upsertPreset(only);
    const next = await deletePreset(only.id);
    const twitch = next.filter((p) => p.platform === 'twitch');
    expect(twitch.length).toBeGreaterThanOrEqual(1);
  });

  it('isolates presets per account and restores on re-login', async () => {
    const a = createBlankPreset('youtube', 'A Channel');
    a.streamKey = 'secret-a';
    await upsertPreset(a);

    setLiveCredentialsOwner(USER_B);
    expect(getLiveCredentialsOwner()).toBe(USER_B);
    const bList = await loadPresetsForPlatform('youtube');
    expect(bList.every((p) => p.streamKey !== 'secret-a')).toBe(true);

    const b = createBlankPreset('youtube', 'B Channel');
    b.streamKey = 'secret-b';
    await upsertPreset(b);

    setLiveCredentialsOwner(USER_A);
    const back = await loadPresetsForPlatform('youtube');
    expect(back.some((p) => p.streamKey === 'secret-a')).toBe(true);
    expect(back.every((p) => p.streamKey !== 'secret-b')).toBe(true);
  });
});
