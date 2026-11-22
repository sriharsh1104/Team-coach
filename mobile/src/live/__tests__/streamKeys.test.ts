import * as SecureStore from 'expo-secure-store';
import {
  createBlankPreset,
  deletePreset,
  loadAllPresets,
  loadPresetsForPlatform,
  upsertPreset,
} from '../streamKeys';

describe('streamKeys presets', () => {
  beforeEach(async () => {
    await SecureStore.deleteItemAsync('sacred.live.presets.v1');
    for (const p of ['youtube', 'twitch', 'kick'] as const) {
      await SecureStore.deleteItemAsync(`sacred.live.rtmpUrl.${p}`);
      await SecureStore.deleteItemAsync(`sacred.live.streamKey.${p}`);
      await SecureStore.deleteItemAsync(`sacred.live.title.${p}`);
      await SecureStore.deleteItemAsync(`sacred.live.banner.${p}`);
      await SecureStore.deleteItemAsync(`sacred.live.activePresetId.${p}`);
    }
  });

  it('migrates empty storage into one preset per platform', async () => {
    const all = await loadAllPresets();
    expect(all.map((p) => p.platform).sort()).toEqual(['kick', 'twitch', 'youtube']);
    const yt = await loadPresetsForPlatform('youtube');
    expect(yt).toHaveLength(1);
    expect(yt[0].rtmpUrl).toContain('youtube.com');
  });

  it('saves multiple named options for the same platform', async () => {
    // Migration seeds one default per platform first.
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
});
