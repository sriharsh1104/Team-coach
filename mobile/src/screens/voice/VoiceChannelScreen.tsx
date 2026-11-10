import React, { Component, ErrorInfo, ReactNode, useEffect, useState } from 'react';
import {
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
import { VoiceChannelController } from '../../voice/types';
import { Screen } from '../../brand/Screen';
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
  // Self-hosted only needs mediasoup + WebRTC — skip livekit-client Room
  // import so Hermes WeakRef paths in LiveKit never run in that mode.
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

/**
 * Function-component shell so the fallback can subscribe to the live theme —
 * VoiceErrorBoundary is a class component and can't call hooks itself.
 */
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
              data={[
                {
                  id: user?.id ?? 'me',
                  name: `${user?.name ?? 'You'} (You)`,
                  isLocallyMuted: false,
                  isSelf: true,
                },
                ...voice.participants.map((p) => ({ ...p, isSelf: false })),
              ]}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <View style={themed.participantRow}>
                  <View style={styles.participantInfo}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {(item.name[0] ?? '?').toUpperCase()}
                      </Text>
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
                      style={[
                        styles.smallButton,
                        item.isLocallyMuted && themed.smallButtonActive,
                      ]}
                      onPress={() => voice.toggleParticipantMute(item.id)}
                    >
                      <Text
                        style={[
                          themed.smallButtonText,
                          item.isLocallyMuted && themed.smallButtonTextActive,
                        ]}
                      >
                        {item.isLocallyMuted ? 'Unmute' : 'Mute'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}
            />

            <View style={themed.bottomBar}>
              <Pressable
                style={[themed.barButton, voice.isMuted && styles.barButtonDanger]}
                onPress={voice.toggleMute}
              >
                <ButtonLabel
                  icon={voice.isMuted ? 'mic-off' : 'mic'}
                  color={voice.isMuted ? '#fff' : colors.chromeInk}
                >
                  {voice.isMuted ? 'Unmute Mic' : 'Mute Mic'}
                </ButtonLabel>
              </Pressable>
              <Pressable
                style={[themed.barButton, styles.barButtonDanger]}
                onPress={voice.leave}
              >
                <ButtonLabel icon="call" color="#fff">
                  Disconnect
                </ButtonLabel>
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
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#5865f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700' },
  smallButton: {
    borderWidth: 1,
    borderColor: '#5f6368',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  barButtonDanger: { backgroundColor: '#dc2626' },
});

/**
 * Theme-dependent — everything here sits directly on the themed <Screen>
 * background, so it must follow the palette. The `channelCard` block above
 * stays a deliberate fixed-dark panel (Discord-style) and is self-consistent.
 */
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
    smallButtonActive: { backgroundColor: c.chrome, borderColor: c.chrome },
    smallButtonText: { fontWeight: '600' as const, color: c.text },
    smallButtonTextActive: { color: c.chromeInk },
    bottomBar: {
      flexDirection: 'row' as const,
      gap: 10,
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    barButton: {
      flex: 1,
      backgroundColor: c.chrome,
      borderRadius: 8,
      paddingVertical: 14,
      alignItems: 'center' as const,
    },
  };
}
