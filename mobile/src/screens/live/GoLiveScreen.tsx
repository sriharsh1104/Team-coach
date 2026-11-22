import React, { useCallback, useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../brand/Screen';
import { useLive } from '../../live/LiveContext';
import {
  LIVE_PLATFORMS,
  LivePlatform,
  loadRtmpUrl,
  loadStreamKey,
  saveRtmpUrl,
  saveStreamKey,
} from '../../live/streamKeys';
import { MainStackParamList } from '../../navigation/types';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { SoftPressable } from '../../ui/SoftPressable';
import { useSharedStyles } from '../shared';

type Props = NativeStackScreenProps<MainStackParamList, 'GoLive'>;

/**
 * Go Live: each person uses their own YouTube / Twitch / Kick stream URL + key.
 * Saved on this device so you don’t re-paste every time. Platforms keep the
 * same key until you reset it in their dashboard — the app does not invent a
 * new one per stream.
 */
export function GoLiveScreen(_props: Props) {
  const shared = useSharedStyles();
  const { colors } = useTheme();
  const styles = useThemedStyles(screenStyles);
  const { live, starting, elapsedSec, startLive, stopLive } = useLive();

  const [platform, setPlatform] = useState<LivePlatform>('youtube');
  const [rtmpUrl, setRtmpUrl] = useState('');
  const [streamKey, setStreamKey] = useState('');
  const [loadingKeys, setLoadingKeys] = useState(true);

  const meta = LIVE_PLATFORMS.find((p) => p.id === platform)!;

  useEffect(() => {
    let cancelled = false;
    setLoadingKeys(true);
    void (async () => {
      const [url, key] = await Promise.all([
        loadRtmpUrl(platform),
        loadStreamKey(platform),
      ]);
      if (cancelled) return;
      setRtmpUrl(url);
      setStreamKey(key);
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
    ]);
  }, [platform, rtmpUrl, streamKey]);

  const onGoLive = async () => {
    await persist();
    await startLive({ rtmpUrl: rtmpUrl.trim(), streamKey: streamKey.trim() });
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
          Stream your screen with game sound and your mic. Use your own channel
          keys — saved on this phone for next time.
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
          Paste once from your YouTube / Twitch / Kick dashboard. The key stays
          the same until you reset it there — Go Live saves it on this device so
          you don’t dig it out every stream. Some games block audio capture;
          those stream video + mic only. Stop screen recording before going live.
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
            <Text style={shared.buttonText}>
              {starting ? 'Starting…' : 'Go Live'}
            </Text>
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
  });
}
