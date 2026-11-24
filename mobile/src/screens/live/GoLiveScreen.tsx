import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../brand/Screen';
import { useLive } from '../../live/LiveContext';
import {
  LIVE_PLATFORMS,
  LivePlatform,
  StreamPreset,
  createBlankPreset,
  deletePreset,
  getActivePresetId,
  loadPresetsForPlatform,
  loadSelectedPlatforms,
  saveSelectedPlatforms,
  upsertPreset,
} from '../../live/streamKeys';
import { MainStackParamList } from '../../navigation/types';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { SoftPressable } from '../../ui/SoftPressable';
import { AppIcon } from '../../ui/AppIcon';
import { SecretField } from '../../ui/SecretField';
import { emitToast } from '../../ui/toastBus';
import { confirmAsync } from '../../ui/confirmAsync';
import { useSharedStyles } from '../shared';

type Props = NativeStackScreenProps<MainStackParamList, 'GoLive'>;

/** RTMP needs URL+key; SRT needs streamid in URL (or URL + key → streamid). */
function presetHasIngest(p: { rtmpUrl?: string; streamKey?: string } | null | undefined): boolean {
  const url = p?.rtmpUrl?.trim() ?? '';
  const key = p?.streamKey?.trim() ?? '';
  if (!url) return false;
  if (/^srt:\/\//i.test(url)) {
    return /streamid=[^&]+/i.test(url) || !!key;
  }
  return !!key;
}

/**
 * Go Live: save YouTube / Twitch / Kick title, banner, stream URL + key.
 * Tick 1–3 platforms to stream the same screen to all of them together.
 */
export function GoLiveScreen(_props: Props) {
  const shared = useSharedStyles();
  const { colors } = useTheme();
  const styles = useThemedStyles(screenStyles);
  const { live, starting, elapsedSec, startLive, stopLive } = useLive();

  /** Platforms included in the next Go Live (multi-select). */
  const [selected, setSelected] = useState<LivePlatform[]>(['youtube']);
  /** Which selected platform's saved details are being edited. */
  const [editPlatform, setEditPlatform] = useState<LivePlatform>('youtube');
  const [presets, setPresets] = useState<StreamPreset[]>([]);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [rtmpUrl, setRtmpUrl] = useState('');
  const [streamKey, setStreamKey] = useState('');
  const [youtubeLiveUrl, setYoutubeLiveUrl] = useState('');
  const [title, setTitle] = useState('');
  const [bannerUri, setBannerUri] = useState<string | null>(null);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const meta = LIVE_PLATFORMS.find((p) => p.id === editPlatform)!;
  const activePreset = useMemo(
    () => presets.find((p) => p.id === presetId) ?? null,
    [presets, presetId],
  );

  const applyPreset = useCallback((p: StreamPreset) => {
    setPresetId(p.id);
    setLabel(p.label);
    setRtmpUrl(p.rtmpUrl);
    setStreamKey(p.streamKey);
    setYoutubeLiveUrl(p.youtubeLiveUrl ?? '');
    setTitle(p.title);
    setBannerUri(p.bannerUri || null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const platforms = await loadSelectedPlatforms();
      if (cancelled) return;
      setSelected(platforms);
      setEditPlatform(platforms[0] ?? 'youtube');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingKeys(true);
    void (async () => {
      const [list, activeId] = await Promise.all([
        loadPresetsForPlatform(editPlatform),
        getActivePresetId(editPlatform),
      ]);
      if (cancelled) return;
      setPresets(list);
      const chosen =
        list.find((p) => p.id === activeId) ??
        list[0] ??
        createBlankPreset(editPlatform);
      if (!list.some((p) => p.id === chosen.id)) {
        const next = await upsertPreset(chosen);
        if (cancelled) return;
        setPresets(next.filter((p) => p.platform === editPlatform));
      }
      applyPreset(chosen);
      setLoadingKeys(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [editPlatform, applyPreset]);

  const togglePlatform = (id: LivePlatform) => {
    if (live || starting) return;
    setSelected((prev) => {
      const has = prev.includes(id);
      let next: LivePlatform[];
      if (has) {
        if (prev.length === 1) {
          emitToast('Keep at least one platform selected');
          return prev;
        }
        next = prev.filter((p) => p !== id);
      } else {
        next = [...prev, id];
      }
      void saveSelectedPlatforms(next);
      if (!next.includes(editPlatform)) {
        setEditPlatform(next[0]);
      }
      return next;
    });
  };

  const buildCurrent = useCallback((): StreamPreset => {
    return {
      id: presetId ?? createBlankPreset(editPlatform).id,
      label: label.trim() || meta.label,
      platform: editPlatform,
      rtmpUrl: rtmpUrl.trim(),
      streamKey: streamKey.trim(),
      title: title.trim(),
      bannerUri: bannerUri ?? '',
      youtubeLiveUrl:
        editPlatform === 'youtube' ? youtubeLiveUrl.trim() : '',
    };
  }, [
    presetId,
    label,
    editPlatform,
    rtmpUrl,
    streamKey,
    title,
    bannerUri,
    youtubeLiveUrl,
    meta.label,
  ]);

  const onSave = async () => {
    if (!rtmpUrl.trim() && !streamKey.trim() && !title.trim() && !label.trim()) {
      emitToast('Enter a name, title, or stream URL to save');
      return;
    }
    setSaving(true);
    try {
      const saved = buildCurrent();
      const next = await upsertPreset(saved);
      setPresets(next.filter((p) => p.platform === editPlatform));
      setPresetId(saved.id);
      emitToast(`${meta.label} details saved`);
    } catch {
      emitToast('Could not save');
    } finally {
      setSaving(false);
    }
  };

  const onSaveAsNew = async () => {
    const blank = createBlankPreset(editPlatform, undefined, presets.length);
    const saved: StreamPreset = {
      ...buildCurrent(),
      id: blank.id,
      label: label.trim() || blank.label,
    };
    setSaving(true);
    try {
      const next = await upsertPreset(saved);
      setPresets(next.filter((p) => p.platform === editPlatform));
      applyPreset(saved);
      emitToast('New option saved');
    } catch {
      emitToast('Could not save');
    } finally {
      setSaving(false);
    }
  };

  const onDeletePreset = async () => {
    if (!presetId) return;
    const ok = await confirmAsync(
      'Delete saved option?',
      `Remove “${activePreset?.label || label || 'this option'}” for ${meta.label}?`,
      'Delete',
      'Cancel',
    );
    if (!ok) return;
    const nextAll = await deletePreset(presetId);
    const next = nextAll.filter((p) => p.platform === editPlatform);
    setPresets(next);
    applyPreset(next[0] ?? createBlankPreset(editPlatform));
    emitToast('Deleted');
  };

  const pickBanner = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      emitToast('Allow photo access to set a live banner');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [16, 3],
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setBannerUri(result.assets[0].uri);
  };

  const onGoLive = async () => {
    // Persist the form being edited first.
    await upsertPreset(buildCurrent());

    const destinations: Array<{ rtmpUrl: string; streamKey: string }> = [];
    let overlayTitle = title.trim();
    let overlayBanner = bannerUri;
    let overlayYoutubeLiveUrl = '';

    for (const platform of selected) {
      const [list, activeId] = await Promise.all([
        loadPresetsForPlatform(platform),
        getActivePresetId(platform),
      ]);
      const preset =
        (platform === editPlatform ? buildCurrent() : null) ||
        list.find((p) => p.id === activeId) ||
        list[0];
      if (!presetHasIngest(preset)) {
        const name =
          LIVE_PLATFORMS.find((p) => p.id === platform)?.label ?? platform;
        emitToast(`Add stream URL + key for ${name} (or uncheck it)`);
        return;
      }
      destinations.push({
        rtmpUrl: preset.rtmpUrl.trim(),
        streamKey: preset.streamKey.trim(),
      });
      if (platform === 'youtube' && preset.youtubeLiveUrl?.trim()) {
        overlayYoutubeLiveUrl = preset.youtubeLiveUrl.trim();
      }
      if (platform === selected[0]) {
        overlayTitle = preset.title?.trim() || overlayTitle;
        overlayBanner = preset.bannerUri || overlayBanner;
      }
    }

    await startLive({
      destinations,
      title: overlayTitle,
      bannerUri: overlayBanner,
      youtubeLiveUrl: overlayYoutubeLiveUrl || null,
    });
  };

  if (Platform.OS !== 'android') {
    return (
      <Screen>
        <View style={styles.body}>
          <Text style={[shared.title, { textAlign: 'left' }]}>Go Live</Text>
          <Text style={styles.help}>
            Go Live is available on Android. Rebuild and install the Android app
            to stream to YouTube, Twitch, or Kick.
          </Text>
        </View>
      </Screen>
    );
  }

  const busy = live || starting || loadingKeys || saving;
  const canGoLive =
    selected.length > 0 &&
    !starting &&
    !loadingKeys &&
    (selected.includes(editPlatform)
      ? presetHasIngest({ rtmpUrl, streamKey })
      : true);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.lead}>
          Tick one, two, or all three platforms — the same screen streams to
          every checked destination. Save title, banner, URL and key per
          platform so you don&apos;t re-paste next time.
        </Text>

        <Text style={styles.label}>Stream to (select 1–3)</Text>
        <View style={styles.chips}>
          {LIVE_PLATFORMS.map((p) => {
            const on = selected.includes(p.id);
            return (
              <Pressable
                key={p.id}
                onPress={() => togglePlatform(p.id)}
                disabled={live || starting}
                style={[
                  styles.chip,
                  {
                    borderColor: on ? colors.chrome : colors.border,
                    backgroundColor: on
                      ? 'rgba(201,204,209,0.18)'
                      : 'transparent',
                  },
                ]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${p.label}${on ? ' selected' : ''}`}
              >
                <AppIcon
                  name={on ? 'checkmark' : 'add-circle-outline'}
                  size={14}
                  color={on ? colors.text : colors.textMuted}
                />
                <Text
                  style={[
                    styles.chipText,
                    { color: on ? colors.text : colors.textMuted },
                  ]}
                >
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Edit details for</Text>
        <View style={styles.chips}>
          {selected.map((id) => {
            const p = LIVE_PLATFORMS.find((x) => x.id === id)!;
            const active = id === editPlatform;
            return (
              <Pressable
                key={id}
                onPress={() => setEditPlatform(id)}
                disabled={live || starting}
                style={[
                  styles.chip,
                  {
                    borderColor: active ? colors.link : colors.border,
                    backgroundColor: active
                      ? 'rgba(139,156,255,0.16)'
                      : 'transparent',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: active ? colors.text : colors.textMuted },
                  ]}
                >
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Saved Option</Text>
        <Pressable
          style={[
            styles.dropdown,
            { borderColor: colors.border, backgroundColor: colors.surface },
          ]}
          onPress={() => !busy && setPickerOpen(true)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Choose saved stream option"
        >
          <Text
            style={[styles.dropdownText, { color: colors.text }]}
            numberOfLines={1}
          >
            {activePreset?.label || label || 'Select…'}
          </Text>
          <AppIcon
            name="chevron-back"
            size={16}
            color={colors.textMuted}
            style={{ transform: [{ rotate: '-90deg' }] }}
          />
        </Pressable>

        <Text style={styles.label}>Option Name</Text>
        <TextInput
          style={shared.input}
          value={label}
          onChangeText={setLabel}
          editable={!busy}
          placeholder={`e.g. Main ${meta.label}`}
          placeholderTextColor={colors.textDim}
          maxLength={40}
        />

        <Text style={styles.label}>Stream Title</Text>
        <TextInput
          style={shared.input}
          value={title}
          onChangeText={setTitle}
          editable={!busy}
          placeholder="Shown on screen while live"
          placeholderTextColor={colors.textDim}
          maxLength={80}
        />

        <Text style={styles.label}>Banner</Text>
        <View style={styles.bannerRow}>
          {bannerUri ? (
            <Image
              source={{ uri: bannerUri }}
              style={styles.bannerPreview}
              resizeMode="cover"
            />
          ) : (
            <View
              style={[
                styles.bannerPreview,
                styles.bannerEmpty,
                { borderColor: colors.border },
              ]}
            >
              <Text style={{ color: colors.textDim, fontSize: 12 }}>
                No banner
              </Text>
            </View>
          )}
          <View style={styles.bannerActions}>
            <SoftPressable
              style={[shared.button, styles.bannerBtn]}
              disabled={busy}
              onPress={() => void pickBanner()}
              pressScale={0.98}
            >
              <Text style={shared.buttonText}>
                {bannerUri ? 'Change Banner' : 'Set Banner'}
              </Text>
            </SoftPressable>
            {bannerUri ? (
              <Pressable
                onPress={() => setBannerUri(null)}
                disabled={busy}
                hitSlop={8}
                accessibilityLabel="Remove banner"
              >
                <Text style={{ color: colors.link, fontWeight: '700' }}>
                  Remove
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <Text style={styles.label}>{meta.urlHint}</Text>
        <SecretField
          value={rtmpUrl}
          onChangeText={setRtmpUrl}
          editable={!busy}
          placeholder={meta.defaultUrl || 'rtmps://…'}
          accessibilityLabelShow="Show stream URL"
          accessibilityLabelHide="Hide stream URL"
        />

        <Text style={styles.label}>{meta.keyHint}</Text>
        <SecretField
          value={streamKey}
          onChangeText={setStreamKey}
          editable={!busy}
          placeholder="Paste your stream key"
          accessibilityLabelShow="Show stream key"
          accessibilityLabelHide="Hide stream key"
        />

        {editPlatform === 'youtube' ? (
          <>
            <Text style={styles.label}>YouTube Live Watch URL (optional)</Text>
            <TextInput
              style={shared.input}
              value={youtubeLiveUrl}
              onChangeText={setYoutubeLiveUrl}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              placeholder="https://youtube.com/watch?v=… or /live/…"
              placeholderTextColor={colors.textDim}
            />
            <Text style={styles.help}>
              After you go live in YouTube Studio, paste that live watch URL
              here so viewer comments appear on your stream overlay (needs
              YOUTUBE_DATA_API_KEY on the server). Team/Guild chat still shows
              without this.
            </Text>
          </>
        ) : null}

        <Text style={styles.help}>
          Save each platform once. At Go Live, every checked platform that has
          a URL + key receives the same screen. Kick accepts RTMPS or SRT
          (paste the full srt://… URL from the dashboard). Pause mutes audio;
          End stops all destinations.
        </Text>

        {live ? (
          <>
            <Text style={styles.liveHint}>
              LIVE · {formatElapsed(elapsedSec)}
              {selected.length > 1 ? ` · ${selected.length} platforms` : ''}
            </Text>
            <SoftPressable
              style={[shared.button, { backgroundColor: colors.danger }]}
              onPress={() => void stopLive()}
              pressScale={0.98}
            >
              <Text style={[shared.buttonText, { color: '#fff' }]}>
                End Live
              </Text>
            </SoftPressable>
          </>
        ) : (
          <View style={styles.actionCol}>
            <View style={styles.saveRow}>
              <SoftPressable
                style={[
                  shared.button,
                  styles.secondaryBtn,
                  styles.saveFlex,
                  { borderColor: colors.border },
                  saving && shared.buttonDisabled,
                ]}
                disabled={busy}
                onPress={() => void onSave()}
                pressScale={0.98}
                accessibilityLabel="Save stream option"
              >
                <Text style={[shared.buttonText, { color: colors.text }]}>
                  {saving ? 'Saving…' : 'Save'}
                </Text>
              </SoftPressable>
              <SoftPressable
                style={[
                  shared.button,
                  styles.secondaryBtn,
                  styles.saveFlex,
                  { borderColor: colors.danger },
                ]}
                disabled={busy}
                onPress={() => void onDeletePreset()}
                pressScale={0.98}
                accessibilityLabel="Delete saved option"
              >
                <Text style={[shared.buttonText, { color: colors.danger }]}>
                  Delete
                </Text>
              </SoftPressable>
            </View>
            <SoftPressable
              style={[
                shared.button,
                (!canGoLive || starting) && shared.buttonDisabled,
              ]}
              disabled={!canGoLive || starting}
              onPress={() => void onGoLive()}
              pressScale={0.98}
            >
              <View style={styles.goLiveRow}>
                <AppIcon name="play" size={18} color="#0a0a0c" />
                <Text style={shared.buttonText}>
                  {starting
                    ? 'Starting…'
                    : selected.length > 1
                      ? `Go Live (${selected.length})`
                      : 'Go Live'}
                </Text>
              </View>
            </SoftPressable>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setPickerOpen(false)}
        >
          <Pressable
            style={[
              styles.modalCard,
              { backgroundColor: colors.bg, borderColor: colors.border },
            ]}
            onPress={(e) => e.stopPropagation?.()}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {meta.label} options
            </Text>
            <ScrollView style={styles.modalList}>
              {presets.map((p) => {
                const selectedRow = p.id === presetId;
                return (
                  <Pressable
                    key={p.id}
                    style={[
                      styles.modalRow,
                      selectedRow && {
                        backgroundColor: 'rgba(201,204,209,0.12)',
                      },
                    ]}
                    onPress={() => {
                      applyPreset(p);
                      setPickerOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selectedRow }}
                    accessibilityLabel={p.label}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={[styles.modalRowTitle, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {p.label}
                      </Text>
                      <Text
                        style={{ color: colors.textDim, fontSize: 12 }}
                        numberOfLines={1}
                      >
                        {p.title || p.rtmpUrl || 'No URL yet'}
                      </Text>
                    </View>
                    {selectedRow ? (
                      <AppIcon name="checkmark" size={18} color={colors.link} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            <SoftPressable
              style={[shared.button, styles.modalActionBtn]}
              onPress={() => {
                setPickerOpen(false);
                void onSaveAsNew();
              }}
              pressScale={0.98}
            >
              <Text style={shared.buttonText}>Add New Option</Text>
            </SoftPressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function formatElapsed(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function screenStyles(c: ThemeColors) {
  return StyleSheet.create({
    body: {
      padding: 24,
      paddingBottom: 48,
      gap: 4,
    },
    lead: {
      color: c.textMuted,
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 16,
    },
    label: {
      color: c.text,
      fontWeight: '700',
      fontSize: 13,
      marginBottom: 6,
      marginTop: 8,
      textTransform: 'capitalize',
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 8,
    },
    chip: {
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    chipText: {
      fontWeight: '700',
      fontSize: 13,
    },
    dropdown: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    dropdownText: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
    },
    bannerRow: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
      marginBottom: 4,
    },
    bannerPreview: {
      width: 120,
      height: 40,
      borderRadius: 8,
      overflow: 'hidden',
    },
    bannerEmpty: {
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.04)',
    },
    bannerActions: {
      flex: 1,
      gap: 8,
      alignItems: 'flex-start',
    },
    bannerBtn: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      alignSelf: 'stretch',
    },
    help: {
      color: c.textDim,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 8,
      marginBottom: 12,
    },
    liveHint: {
      color: '#ef4444',
      fontWeight: '800',
      fontSize: 14,
      letterSpacing: 0.5,
      marginBottom: 4,
      textAlign: 'center',
    },
    actionCol: {
      gap: 10,
    },
    saveRow: {
      flexDirection: 'row',
      gap: 10,
    },
    saveFlex: {
      flex: 1,
    },
    secondaryBtn: {
      backgroundColor: 'transparent',
      borderWidth: 1,
    },
    goLiveRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      padding: 24,
    },
    modalCard: {
      borderRadius: 16,
      borderWidth: 1,
      maxHeight: '70%',
      padding: 16,
      gap: 10,
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: '700',
      textTransform: 'capitalize',
    },
    modalList: {
      maxHeight: 280,
    },
    modalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderRadius: 10,
    },
    modalRowTitle: {
      fontWeight: '700',
      fontSize: 15,
    },
    modalActionBtn: {
      alignSelf: 'stretch',
    },
  });
}
