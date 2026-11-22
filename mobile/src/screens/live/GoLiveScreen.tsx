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
  upsertPreset,
} from '../../live/streamKeys';
import { MainStackParamList } from '../../navigation/types';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { SoftPressable } from '../../ui/SoftPressable';
import { AppIcon } from '../../ui/AppIcon';
import { emitToast } from '../../ui/toastBus';
import { useSharedStyles } from '../shared';

type Props = NativeStackScreenProps<MainStackParamList, 'GoLive'>;

/**
 * Go Live: each person uses their own YouTube / Twitch / Kick stream URL + key.
 * Multiple named presets per platform — pick from a dropdown, Save without
 * going live, or Go Live with the selected preset.
 */
export function GoLiveScreen(_props: Props) {
  const shared = useSharedStyles();
  const { colors } = useTheme();
  const styles = useThemedStyles(screenStyles);
  const { live, starting, elapsedSec, startLive, stopLive } = useLive();

  const [platform, setPlatform] = useState<LivePlatform>('youtube');
  const [presets, setPresets] = useState<StreamPreset[]>([]);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [rtmpUrl, setRtmpUrl] = useState('');
  const [streamKey, setStreamKey] = useState('');
  const [title, setTitle] = useState('');
  const [bannerUri, setBannerUri] = useState<string | null>(null);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const meta = LIVE_PLATFORMS.find((p) => p.id === platform)!;
  const activePreset = useMemo(
    () => presets.find((p) => p.id === presetId) ?? null,
    [presets, presetId],
  );

  const applyPreset = useCallback((p: StreamPreset) => {
    setPresetId(p.id);
    setLabel(p.label);
    setRtmpUrl(p.rtmpUrl);
    setStreamKey(p.streamKey);
    setTitle(p.title);
    setBannerUri(p.bannerUri || null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingKeys(true);
    void (async () => {
      const [list, activeId] = await Promise.all([
        loadPresetsForPlatform(platform),
        getActivePresetId(platform),
      ]);
      if (cancelled) return;
      setPresets(list);
      const chosen =
        list.find((p) => p.id === activeId) ?? list[0] ?? createBlankPreset(platform);
      if (!list.some((p) => p.id === chosen.id)) {
        const next = await upsertPreset(chosen);
        if (cancelled) return;
        setPresets(next.filter((p) => p.platform === platform));
      }
      applyPreset(chosen);
      setLoadingKeys(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [platform, applyPreset]);

  const buildCurrent = useCallback((): StreamPreset => {
    return {
      id: presetId ?? createBlankPreset(platform).id,
      label: label.trim() || meta.label,
      platform,
      rtmpUrl: rtmpUrl.trim(),
      streamKey: streamKey.trim(),
      title: title.trim(),
      bannerUri: bannerUri ?? '',
    };
  }, [presetId, label, platform, rtmpUrl, streamKey, title, bannerUri, meta.label]);

  const onSave = async () => {
    if (!rtmpUrl.trim() && !streamKey.trim() && !title.trim() && !label.trim()) {
      emitToast('Enter a name or stream URL to save');
      return;
    }
    setSaving(true);
    try {
      const saved = buildCurrent();
      const next = await upsertPreset(saved);
      setPresets(next.filter((p) => p.platform === platform));
      setPresetId(saved.id);
      emitToast('Stream details saved');
    } catch {
      emitToast('Could not save');
    } finally {
      setSaving(false);
    }
  };

  const onSaveAsNew = async () => {
    const blank = createBlankPreset(platform, undefined, presets.length);
    const saved: StreamPreset = {
      ...buildCurrent(),
      id: blank.id,
      label: label.trim() || blank.label,
    };
    setSaving(true);
    try {
      const next = await upsertPreset(saved);
      setPresets(next.filter((p) => p.platform === platform));
      applyPreset(saved);
      emitToast('New stream option saved');
    } catch {
      emitToast('Could not save');
    } finally {
      setSaving(false);
    }
  };

  const onDeletePreset = async () => {
    if (!presetId || presets.length <= 1) {
      emitToast('Keep at least one option');
      return;
    }
    const nextAll = await deletePreset(presetId);
    const next = nextAll.filter((p) => p.platform === platform);
    setPresets(next);
    applyPreset(next[0]);
    emitToast('Removed saved option');
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
    await upsertPreset(buildCurrent());
    await startLive({
      rtmpUrl: rtmpUrl.trim(),
      streamKey: streamKey.trim(),
      title: title.trim(),
      bannerUri,
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

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.lead}>
          Stream your screen with game sound and your mic. Save multiple YouTube /
          Twitch / Kick options so you don&apos;t re-paste every time — then Go Live
          when ready.
        </Text>

        <Text style={styles.label}>Platform</Text>
        <View style={styles.chips}>
          {LIVE_PLATFORMS.map((p) => {
            const active = p.id === platform;
            return (
              <Pressable
                key={p.id}
                onPress={() => setPlatform(p.id)}
                disabled={live || starting}
                style={[
                  styles.chip,
                  {
                    borderColor: active ? colors.chrome : colors.border,
                    backgroundColor: active
                      ? 'rgba(201,204,209,0.18)'
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
          style={[styles.dropdown, { borderColor: colors.border, backgroundColor: colors.surface }]}
          onPress={() => !busy && setPickerOpen(true)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Choose saved stream option"
        >
          <Text style={[styles.dropdownText, { color: colors.text }]} numberOfLines={1}>
            {activePreset?.label || label || 'Select…'}
          </Text>
          <AppIcon name="chevron-back" size={16} color={colors.textMuted} style={{ transform: [{ rotate: '-90deg' }] }} />
        </Pressable>

        <Text style={styles.label}>Option Name</Text>
        <TextInput
          style={shared.input}
          value={label}
          onChangeText={setLabel}
          editable={!busy}
          placeholder="e.g. Main YouTube, Scrim Alt"
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
        <TextInput
          style={shared.input}
          value={rtmpUrl}
          onChangeText={setRtmpUrl}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          placeholder={meta.defaultUrl || 'rtmps://…'}
          placeholderTextColor={colors.textDim}
        />

        <Text style={styles.label}>{meta.keyHint}</Text>
        <TextInput
          style={shared.input}
          value={streamKey}
          onChangeText={setStreamKey}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          editable={!busy}
          placeholder="Paste your stream key"
          placeholderTextColor={colors.textDim}
        />

        <Text style={styles.help}>
          Save once, then pick from the dropdown next time. While live: title/banner
          show at the top, Pause mutes audio, and Team/Guild chat lines appear on
          the right then fade after 5 seconds.
        </Text>

        {live ? (
          <>
            <Text style={styles.liveHint}>
              LIVE · {formatElapsed(elapsedSec)}
            </Text>
            <SoftPressable
              style={[shared.button, { backgroundColor: colors.danger }]}
              onPress={() => void stopLive()}
              pressScale={0.98}
            >
              <Text style={[shared.buttonText, { color: '#fff' }]}>End Live</Text>
            </SoftPressable>
          </>
        ) : (
          <View style={styles.actionCol}>
            <SoftPressable
              style={[
                shared.button,
                styles.secondaryBtn,
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
                (starting || !rtmpUrl.trim() || !streamKey.trim()) &&
                  shared.buttonDisabled,
              ]}
              disabled={starting || loadingKeys || !rtmpUrl.trim() || !streamKey.trim()}
              onPress={() => void onGoLive()}
              pressScale={0.98}
            >
              <View style={styles.goLiveRow}>
                <AppIcon name="play" size={18} color="#0a0a0c" />
                <Text style={shared.buttonText}>
                  {starting ? 'Starting…' : 'Go Live'}
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
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: colors.bg, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation?.()}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>Saved Options</Text>
            <ScrollView style={styles.modalList}>
              {presets.map((p) => {
                const selected = p.id === presetId;
                return (
                  <Pressable
                    key={p.id}
                    style={[
                      styles.modalRow,
                      selected && { backgroundColor: 'rgba(201,204,209,0.12)' },
                    ]}
                    onPress={() => {
                      applyPreset(p);
                      setPickerOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={p.label}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.modalRowTitle, { color: colors.text }]} numberOfLines={1}>
                        {p.label}
                      </Text>
                      <Text style={{ color: colors.textDim, fontSize: 12 }} numberOfLines={1}>
                        {p.rtmpUrl || 'No URL yet'}
                      </Text>
                    </View>
                    {selected ? (
                      <AppIcon name="checkmark" size={18} color={colors.link} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.modalActions}>
              <SoftPressable
                style={[shared.button, styles.modalActionBtn]}
                onPress={() => {
                  setPickerOpen(false);
                  void onSaveAsNew();
                }}
                pressScale={0.98}
              >
                <Text style={shared.buttonText}>Add New</Text>
              </SoftPressable>
              {presets.length > 1 ? (
                <Pressable onPress={() => { setPickerOpen(false); void onDeletePreset(); }} hitSlop={8}>
                  <Text style={{ color: colors.danger, fontWeight: '700' }}>Delete Current</Text>
                </Pressable>
              ) : null}
            </View>
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
      paddingHorizontal: 14,
      paddingVertical: 8,
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
    modalActions: {
      gap: 12,
      alignItems: 'center',
      paddingTop: 4,
    },
    modalActionBtn: {
      alignSelf: 'stretch',
    },
  });
}
