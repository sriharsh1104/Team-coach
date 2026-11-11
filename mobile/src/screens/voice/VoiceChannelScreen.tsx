import React, { Component, ErrorInfo, ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated,
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { getToken } from '../../storage/tokenStorage';
import * as voiceApi from '../../api/voice';
import { VoiceConfig } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { VoiceChannelController, VoiceParticipant } from '../../voice/types';
import { Screen } from '../../brand/Screen';
import { AppIcon } from '../../ui/AppIcon';
import { ButtonLabel } from '../../ui/ButtonLabel';
import { useSharedStyles } from '../shared';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';

type VoiceHooks = {
  useHostedVoiceChannel: typeof import('../../voice/useHostedVoiceChannel').useHostedVoiceChannel;
  useSelfHostedVoiceChannel: typeof import('../../voice/useSelfHostedVoiceChannel').useSelfHostedVoiceChannel;
};

function ensureLiveKitGlobals() {
  // Re-apply in case a native module wiped globals before voice load.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('../../polyfills/weakRef').ensureWeakRefPolyfill();

  const g = globalThis as typeof globalThis & { DOMException?: unknown };
  if (typeof g.DOMException === 'undefined') {
    g.DOMException = class DOMException extends Error {
      constructor(message?: string, name?: string) {
        super(message);
        this.name = name || 'DOMException';
      }
    } as unknown as typeof globalThis.DOMException;
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { registerGlobals } = require('@livekit/react-native') as {
    registerGlobals: () => void;
  };
  registerGlobals();
}

function loadVoiceHooks(mode: VoiceConfig['mode']): VoiceHooks {
  ensureLiveKitGlobals();
  if (mode === 'self') {
    return {
      useHostedVoiceChannel: () => {
        throw new Error('Hosted voice hook loaded in self-hosted mode');
      },
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      useSelfHostedVoiceChannel: require('../../voice/useSelfHostedVoiceChannel')
        .useSelfHostedVoiceChannel,
    };
  }
  return {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    useHostedVoiceChannel: require('../../voice/useHostedVoiceChannel')
      .useHostedVoiceChannel,
    useSelfHostedVoiceChannel: () => {
      throw new Error('Self-hosted voice hook loaded in hosted mode');
    },
  };
}

function VoiceErrorFallback({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  const shared = useSharedStyles();
  return (
    <Screen>
      <View style={shared.container}>
        <Text style={shared.error}>{error}</Text>
        <Pressable style={styles.joinButton} onPress={onRetry}>
          <ButtonLabel icon="refresh" color="#fff">
            Try Again
          </ButtonLabel>
        </Pressable>
      </View>
    </Screen>
  );
}

class VoiceErrorBoundary extends Component<
  { children: ReactNode; onRetry: () => void },
  { error: string | null }
> {
  state: { error: string | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message || 'Voice failed to start' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('VoiceChannel crash:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <VoiceErrorFallback
          error={this.state.error}
          onRetry={() => {
            this.setState({ error: null });
            this.props.onRetry();
          }}
        />
      );
    }
    return this.props.children;
  }
}

/** Pulsing green ring shown around a speaking participant's avatar. */
function SpeakingRing() {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.18,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.4,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.9,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [scale, opacity]);

  return (
    <Animated.View
      style={[styles.speakingRing, { transform: [{ scale }], opacity }]}
      pointerEvents="none"
    />
  );
}

type ListItem = (VoiceParticipant & { isSelf: false }) | {
  id: string;
  name: string;
  isLocallyMuted: boolean;
  isSpeaking: boolean;
  isSelf: true;
};

function HostedVoiceChannel({
  config,
  hooks,
}: {
  config: Extract<VoiceConfig, { mode: 'hosted' }>;
  hooks: VoiceHooks;
}) {
  const voice = hooks.useHostedVoiceChannel(config.url, config.token);
  return <VoiceChannelBody voice={voice} />;
}

function SelfHostedVoiceChannel({
  authToken,
  hooks,
}: {
  authToken: string;
  hooks: VoiceHooks;
}) {
  const voice = hooks.useSelfHostedVoiceChannel(authToken);
  return <VoiceChannelBody voice={voice} />;
}

function VoiceChannelBody({ voice }: { voice: VoiceChannelController }) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const themed = useThemedStyles(voiceStyles);
  const inChannel = voice.status === 'connected';

  const listData: ListItem[] = inChannel
    ? [
        {
          id: user?.id ?? 'me',
          name: `${user?.name ?? 'You'} (You)`,
          isLocallyMuted: false,
          isSpeaking: false,
          isSelf: true,
        },
        ...voice.participants.map((p) => ({ ...p, isSelf: false as const })),
      ]
    : [];

  return (
    <Screen>
      <View style={styles.screen}>
        <View style={styles.channelCard}>
          <Text style={styles.channelLabel}>VOICE CHANNEL</Text>
          <Text style={styles.channelName}>Team Voice</Text>
          <Text style={styles.channelMeta}>
            {voice.status === 'connecting'
              ? 'Connecting…'
              : inChannel
                ? `${voice.participants.length + 1} connected`
                : 'Empty — join to talk with your team'}
          </Text>

          {voice.status === 'idle' && (
            <Pressable style={styles.joinButton} onPress={voice.join}>
              <ButtonLabel icon="mic" color="#fff">
                Join Voice Channel
              </ButtonLabel>
            </Pressable>
          )}

          {voice.status === 'connecting' && (
            <View style={styles.connectingBlock}>
              <ActivityIndicator color="#fff" />
            </View>
          )}

          {voice.status === 'error' && (
            <>
              <Text style={styles.errorText}>{voice.errorMessage}</Text>
              <Pressable style={styles.joinButton} onPress={voice.join}>
                <ButtonLabel icon="refresh" color="#fff">
                  Try Again
                </ButtonLabel>
              </Pressable>
            </>
          )}
        </View>

        {inChannel && (
          <>
            <Text style={themed.sectionTitle}>In Channel</Text>
            <FlatList
              data={listData}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <View style={themed.participantRow}>
                  <View style={styles.participantInfo}>
                    {/* Avatar with optional speaking ring */}
                    <View style={styles.avatarWrapper}>
                      {item.isSpeaking && <SpeakingRing />}
                      <View
                        style={[
                          styles.avatar,
                          item.isSpeaking && styles.avatarSpeaking,
                        ]}
                      >
                        <Text style={styles.avatarText}>
                          {(item.name[0] ?? '?').toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={themed.participantName}>{item.name}</Text>
                      {item.isLocallyMuted && (
                        <Text style={themed.mutedHint}>Muted for you</Text>
                      )}
                    </View>
                  </View>
                  {!item.isSelf && (
                    <Pressable
                      hitSlop={8}
                      style={[
                        styles.participantMuteBtn,
                        item.isLocallyMuted && styles.participantMuteBtnActive,
                      ]}
                      onPress={() => voice.toggleParticipantMute(item.id)}
                      accessibilityLabel={
                        item.isLocallyMuted ? 'Unmute for you' : 'Mute for you'
                      }
                    >
                      <AppIcon
                        name={item.isLocallyMuted ? 'mic-off' : 'mic'}
                        size={16}
                        color={item.isLocallyMuted ? '#fff' : colors.icon}
                      />
                    </Pressable>
                  )}
                </View>
              )}
            />

            {/* Compact icon-only bottom bar — Discord style */}
            <View style={themed.bottomBar}>
              <Pressable
                style={[
                  styles.iconBtn,
                  voice.isMuted ? styles.iconBtnDanger : themed.iconBtnDefault,
                ]}
                onPress={voice.toggleMute}
                accessibilityLabel={voice.isMuted ? 'Unmute mic' : 'Mute mic'}
              >
                <AppIcon
                  name={voice.isMuted ? 'mic-off' : 'mic'}
                  size={22}
                  color="#fff"
                />
              </Pressable>
              <Pressable
                style={[styles.iconBtn, styles.iconBtnDanger]}
                onPress={voice.leave}
                accessibilityLabel="Disconnect"
              >
                <AppIcon name="phone-down" size={22} color="#fff" />
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}

function VoiceChannelScreenInner() {
  const shared = useSharedStyles();
  const { colors } = useTheme();
  const [config, setConfig] = useState<VoiceConfig | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hooks, setHooks] = useState<VoiceHooks | null>(null);
  const [nativeError, setNativeError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([voiceApi.getVoiceConfig(), getToken()])
      .then(([cfg, token]) => {
        if (cancelled) return;
        if (!token) {
          setError(
            'You are signed out. Please log in again to use voice channels.',
          );
          return;
        }
        try {
          setHooks(loadVoiceHooks(cfg.mode));
          setConfig(cfg);
          setAuthToken(token);
        } catch (err) {
          setNativeError(
            err instanceof Error
              ? err.message
              : 'Voice native modules failed to load. Reinstall the APK.',
          );
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err?.response?.data?.message?.toString() ??
            'Could not load voice config',
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (nativeError || error) {
    return (
      <Screen>
        <View style={shared.container}>
          <Text style={shared.error}>{nativeError || error}</Text>
        </View>
      </Screen>
    );
  }

  if (!config || !authToken || !hooks) {
    return (
      <Screen>
        <View style={shared.container}>
          <ActivityIndicator color={colors.chrome} />
        </View>
      </Screen>
    );
  }

  return config.mode === 'hosted' ? (
    <HostedVoiceChannel config={config} hooks={hooks} />
  ) : (
    <SelfHostedVoiceChannel authToken={authToken} hooks={hooks} />
  );
}

export function VoiceChannelScreen() {
  const [key, setKey] = useState(0);
  return (
    <VoiceErrorBoundary onRetry={() => setKey((k) => k + 1)}>
      <VoiceChannelScreenInner key={key} />
    </VoiceErrorBoundary>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  channelCard: {
    margin: 16,
    padding: 20,
    borderRadius: 12,
    backgroundColor: '#1e1f22',
  },
  channelLabel: {
    color: '#949ba4',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  channelName: { color: '#f2f3f5', fontSize: 20, fontWeight: '700' },
  channelMeta: { color: '#b5bac1', marginTop: 6, marginBottom: 16 },
  joinButton: {
    backgroundColor: '#23a559',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  connectingBlock: { alignItems: 'center', paddingVertical: 8 },
  errorText: { color: '#f23f43', marginBottom: 12 },
  listContent: { paddingHorizontal: 16, paddingBottom: 12 },
  participantInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  avatarWrapper: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#5865f2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarSpeaking: {
    borderColor: '#23a559',
  },
  avatarText: { color: '#fff', fontWeight: '700' },
  speakingRing: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2.5,
    borderColor: '#23a559',
  },
  participantMuteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#5f6368',
  },
  participantMuteBtnActive: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  // Compact icon-only action buttons
  iconBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnDanger: { backgroundColor: '#dc2626' },
});

function voiceStyles(c: ThemeColors) {
  return {
    sectionTitle: {
      marginHorizontal: 16,
      marginBottom: 8,
      color: c.textMuted,
      fontWeight: '600' as const,
      textTransform: 'capitalize' as const,
    },
    participantRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    participantName: { fontSize: 16, color: c.text },
    mutedHint: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    iconBtnDefault: { backgroundColor: c.surface },
    bottomBar: {
      flexDirection: 'row' as const,
      gap: 16,
      paddingVertical: 16,
      paddingHorizontal: 24,
      borderTopWidth: 1,
      borderTopColor: c.border,
      justifyContent: 'center' as const,
    },
  };
}
