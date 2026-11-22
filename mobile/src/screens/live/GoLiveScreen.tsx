import React, { useCallback, useEffect, useState } from 'react';
import {
  Image,
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
  loadRtmpUrl,
  loadStreamBannerUri,
  loadStreamKey,
  loadStreamTitle,
  saveRtmpUrl,
  saveStreamBannerUri,
  saveStreamKey,
  saveStreamTitle,
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
 * Title + banner show on-screen while live (and in the capture). Chat comments
 * from team/guild float on the right for 5s.
 */
export function GoLiveScreen(_props: Props) {
  const shared = useSharedStyles();
  const { colors } = useTheme();
  const styles = useThemedStyles(screenStyles);
  const { live, starting, elapsedSec, startLive, stopLive } = useLive();

  const [platform, setPlatform] = useState<LivePlatform>('youtube');
  const [rtmpUrl, setRtmpUrl] = useState('');
  const [streamKey, setStreamKey] = useState('');
  const [title, setTitle] = useState('');
  const [bannerUri, setBannerUri] = useState<string | null>(null);
  const [loadingKeys, setLoadingKeys] = useState(true);

  const meta = LIVE_PLATFORMS.find((p) => p.id === platform)!;

  useEffect(() => {
    let cancelled = false;
    setLoadingKeys(true);
    void (async () => {
      const [url, key, savedTitle, savedBanner] = await Promise.all([
        loadRtmpUrl(platform),
        loadStreamKey(platform),
        loadStreamTitle(platform),
        loadStreamBannerUri(platform),
      ]);
      if (cancelled) return;
      setRtmpUrl(url);
      setStreamKey(key);
      setTitle(savedTitle);
      setBannerUri(savedBanner || null);
      setLoadingKeys(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [platform]);

  const persist = useCallback(async () => {
    await Promise.all([
      saveRtmpUrl(platform, rtmpUrl),
      saveStreamKey(platform, streamKey),
      saveStreamTitle(platform, title),
      saveStreamBannerUri(platform, bannerUri ?? ''),
    ]);
  }, [platform, rtmpUrl, streamKey, title, bannerUri]);

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
    await persist();
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

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.lead}>
          Stream your screen with game sound and your mic. Set a title and
          banner for the overlay — team chat comments float on the right for 5
          seconds while you’re live.
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

        <Text style={styles.label}>Stream Title</Text>
        <TextInput
          style={shared.input}
          value={title}
          onChangeText={setTitle}
          editable={!live && !starting && !loadingKeys}
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
              disabled={live || starting}
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
                disabled={live || starting}
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
          editable={!live && !starting && !loadingKeys}
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
          editable={!live && !starting && !loadingKeys}
          placeholder="Paste your stream key"
          placeholderTextColor={colors.textDim}
        />

        <Text style={styles.help}>
          Paste your own channel URL + key once — saved on this phone. While
          live: title/banner show at the top, Pause mutes audio, and Team/Guild
          chat lines appear on the right then fade after 5 seconds (no chat
          panel).
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
          <SoftPressable
            style={[
              shared.button,
              (starting || !rtmpUrl.trim() || !streamKey.trim()) &&
                shared.buttonDisabled,
            ]}
            disabled={starting || !rtmpUrl.trim() || !streamKey.trim()}
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
        )}
      </ScrollView>
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
    goLiveRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
  });
}
