import React, { Component, ErrorInfo, ReactNode, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { getToken } from '../../storage/tokenStorage';
import * as voiceApi from '../../api/voice';
import { VoiceConfig, VoiceRoom } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { VoiceChannelController, VoiceParticipant, ConnectionQualityLevel } from '../../voice/types';
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

/** 4 vertical bars showing connection quality. */
function QualityBars({ quality }: { quality: ConnectionQualityLevel }) {
  const filledCount = quality === 'excellent' ? 4
    : quality === 'good' ? 3
    : quality === 'poor' ? 2
    : quality === 'lost' ? 1
    : 2; // unknown

  const barColor = quality === 'excellent' || quality === 'good'
    ? '#22c55e'
    : quality === 'poor'
    ? '#f59e0b'
    : quality === 'lost'
    ? '#ef4444'
    : '#666';

  const heights = [4, 8, 12, 16];

  return (
    <View style={styles.qualityBars}>
      {heights.map((h, i) => (
        <View
          key={i}
          style={[
            styles.qualityBar,
            { height: h, backgroundColor: i < filledCount ? barColor : '#333' },
          ]}
        />
      ))}
    </View>
  );
}

/** 5-segment volume bar for per-participant volume control. */
function VolumeBar({
  volume,
  onSetVolume,
}: {
  volume: number;
  onSetVolume: (v: number) => void;
}) {
  // volume is 0-1; filled segments = how many of 5 are lit
  const filled = Math.round(volume * 5);
  const color = volume > 0.5 ? '#22c55e' : volume > 0 ? '#f59e0b' : '#555';

  return (
    <View style={styles.volumeBar}>
      {[1, 2, 3, 4, 5].map((seg) => (
        <Pressable
          key={seg}
          hitSlop={4}
          onPress={() => onSetVolume(seg / 5)}
          style={[
            styles.volumeSegment,
            { backgroundColor: seg <= filled ? color : '#333' },
          ]}
        />
      ))}
    </View>
  );
}

type ListItem =
  | (VoiceParticipant & { isSelf: false })
  | {
      id: string;
      name: string;
      isLocallyMuted: boolean;
      isSpeaking: boolean;
      isHandRaised: boolean;
      localVolume: number;
      connectionQuality: ConnectionQualityLevel;
      isSelf: true;
    };

function VoiceChannelBody({
  voice,
  channelName,
  rooms,
  selectedRoom,
  onSelectRoom,
}: {
  voice: VoiceChannelController;
  channelName: string;
  rooms?: VoiceRoom[];
  selectedRoom: VoiceRoom | null;
  onSelectRoom: (room: VoiceRoom) => void;
}) {
  const { user, org } = useAuth();
  const { colors } = useTheme();
  const themed = useThemedStyles(voiceStyles);
  const inChannel = voice.status === 'connected';

  const isAdmin = !!(org?.isOwner || org?.role === 'COACH');

  const listData: ListItem[] = inChannel
    ? [
        {
          id: user?.id ?? 'me',
          name: `${user?.name ?? 'You'} (You)`,
          isLocallyMuted: voice.isMuted,
          isSpeaking: false,
          isHandRaised: voice.isLocalHandRaised,
          localVolume: 1,
          connectionQuality: 'excellent' as ConnectionQualityLevel,
          isSelf: true,
        },
        ...voice.participants.map((p) => ({ ...p, isSelf: false as const })),
      ]
    : [];

  const handleKick = (participant: ListItem) => {
    if (participant.isSelf) return;
    Alert.alert(
      'Kick from Voice',
      `Remove ${participant.name} from the voice channel?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Kick',
          style: 'destructive',
          onPress: () => voice.kickParticipant(participant.id),
        },
      ],
    );
  };

  const showMultipleRooms = rooms && rooms.length > 1;

  return (
    <Screen>
      <View style={styles.screen}>
        {/* Multiple rooms selector */}
        {showMultipleRooms && (
          <View style={styles.roomListContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.roomListContent}
            >
              {rooms.map((room) => {
                const isActive = selectedRoom?.id === room.id;
                return (
                  <Pressable
                    key={room.id}
                    style={[
                      styles.roomChip,
                      isActive && styles.roomChipActive,
                    ]}
                    onPress={() => {
                      if (!isActive) {
                        if (voice.status === 'connected') voice.leave();
                        onSelectRoom(room);
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.roomChipText,
                        isActive && styles.roomChipTextActive,
                      ]}
                    >
                      {room.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        <View style={styles.channelCard}>
          <Text style={styles.channelLabel}>VOICE CHANNEL</Text>
          <Text style={styles.channelName}>{channelName}</Text>
          <Text style={styles.channelMeta}>
            {voice.status === 'connecting'
              ? 'Connecting…'
              : inChannel
                ? `${voice.participants.length + 1} connected`
                : showMultipleRooms && !selectedRoom
                ? 'Select a room above to join'
                : 'Empty — join to talk with your team'}
          </Text>

          {voice.status === 'idle' && (!showMultipleRooms || selectedRoom) && (
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
                  {/* Avatar + speaking ring + hand-raise badge */}
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
                    {item.isHandRaised && (
                      <View style={styles.handRaisedBadge}>
                        <AppIcon name="hand-raised" size={10} color="#fff" />
                      </View>
                    )}
                  </View>

                  {/* Name + quality bars */}
                  <View style={styles.participantInfo}>
                    <View style={styles.nameRow}>
                      <Text style={themed.participantName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <QualityBars quality={item.connectionQuality} />
                    </View>
                    {item.isLocallyMuted && (
                      <Text style={themed.mutedHint}>Muted for you</Text>
                    )}
                  </View>

                  {/* Volume bar (remote only) */}
                  {!item.isSelf && (
                    <VolumeBar
                      volume={item.localVolume}
                      onSetVolume={(v) => voice.setParticipantVolume(item.id, v)}
                    />
                  )}

                  {/* Kick button (admin only, remote only) */}
                  {!item.isSelf && isAdmin && (
                    <Pressable
                      hitSlop={8}
                      style={styles.kickBtn}
                      onPress={() => handleKick(item)}
                      accessibilityLabel={`Kick ${item.name}`}
                    >
                      <AppIcon name="person-remove" size={16} color="#f23f43" />
                    </Pressable>
                  )}
                </View>
              )}
            />

            {/* Bottom bar: [Hand Raise] [Mic/PTT] [Deafen] [Disconnect] */}
            <View style={themed.bottomBar}>
              {/* Hand Raise */}
              <Pressable
                style={[
                  styles.iconBtn,
                  voice.isLocalHandRaised ? styles.iconBtnActive : themed.iconBtnDefault,
                ]}
                onPress={voice.toggleHandRaise}
                accessibilityLabel={voice.isLocalHandRaised ? 'Lower hand' : 'Raise hand'}
              >
                <AppIcon name="hand-raised" size={22} color="#fff" />
              </Pressable>

              {/* Mic / PTT */}
              <View style={styles.micWrapper}>
                <Pressable
                  style={[
                    styles.iconBtn,
                    voice.isMuted ? styles.iconBtnDanger : themed.iconBtnDefault,
                  ]}
                  onPress={voice.isPushToTalk ? undefined : voice.toggleMute}
                  onPressIn={voice.isPushToTalk ? voice.pttStart : undefined}
                  onPressOut={voice.isPushToTalk ? voice.pttStop : undefined}
                  onLongPress={voice.togglePushToTalk}
                  delayLongPress={600}
                  accessibilityLabel={
                    voice.isPushToTalk
                      ? 'Hold to talk'
                      : voice.isMuted
                      ? 'Unmute mic'
                      : 'Mute mic'
                  }
                >
                  <AppIcon
                    name={voice.isMuted ? 'mic-off' : 'mic'}
                    size={22}
                    color="#fff"
                  />
                </Pressable>
                {voice.isPushToTalk && (
                  <Text style={styles.pttLabel}>HOLD</Text>
                )}
              </View>

              {/* Deafen */}
              <Pressable
                style={[
                  styles.iconBtn,
                  voice.isDeafened ? styles.iconBtnDanger : themed.iconBtnDefault,
                ]}
                onPress={voice.toggleDeafen}
                accessibilityLabel={voice.isDeafened ? 'Undeafen' : 'Deafen'}
              >
                <AppIcon
                  name={voice.isDeafened ? 'headset-off' : 'headset'}
                  size={22}
                  color="#fff"
                />
              </Pressable>

              {/* Disconnect */}
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

function HostedVoiceChannel({
  config,
  hooks,
}: {
  config: Extract<VoiceConfig, { mode: 'hosted' }>;
  hooks: VoiceHooks;
}) {
  const hasMultipleRooms = config.rooms && config.rooms.length > 1;
  const [selectedRoom, setSelectedRoom] = useState<VoiceRoom | null>(() => {
    if (config.rooms && config.rooms.length === 1) return config.rooms[0];
    return null;
  });

  const effectiveUrl = selectedRoom ? selectedRoom.url : config.url;
  const effectiveToken = selectedRoom ? selectedRoom.token : config.token;
  const channelName = selectedRoom ? selectedRoom.name : 'Team Voice';

  const voice = hooks.useHostedVoiceChannel(effectiveUrl, effectiveToken);

  const handleSelectRoom = (room: VoiceRoom) => {
    setSelectedRoom(room);
  };

  return (
    <VoiceChannelBody
      voice={voice}
      channelName={channelName}
      rooms={hasMultipleRooms ? config.rooms : undefined}
      selectedRoom={selectedRoom}
      onSelectRoom={handleSelectRoom}
    />
  );
}

function SelfHostedVoiceChannel({
  authToken,
  hooks,
}: {
  authToken: string;
  hooks: VoiceHooks;
}) {
  const voice = hooks.useSelfHostedVoiceChannel(authToken);
  return (
    <VoiceChannelBody
      voice={voice}
      channelName="Team Voice"
      rooms={undefined}
      selectedRoom={null}
      onSelectRoom={() => {}}
    />
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
  avatarWrapper: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
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
  handRaisedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // Quality bars
  qualityBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    marginLeft: 4,
  },
  qualityBar: {
    width: 3,
    borderRadius: 1,
  },
  // Volume bar
  volumeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginHorizontal: 8,
  },
  volumeSegment: {
    width: 10,
    height: 20,
    borderRadius: 2,
  },
  // Kick button
  kickBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
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
  iconBtnActive: { backgroundColor: '#f59e0b' },
  // Mic wrapper for PTT label
  micWrapper: {
    alignItems: 'center',
  },
  pttLabel: {
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 2,
  },
  // Room list
  roomListContainer: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2f33',
  },
  roomListContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  roomChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#2d2f33',
    borderWidth: 1,
    borderColor: '#3f4248',
  },
  roomChipActive: {
    backgroundColor: '#5865f2',
    borderColor: '#5865f2',
  },
  roomChipText: {
    color: '#b5bac1',
    fontSize: 13,
    fontWeight: '600',
  },
  roomChipTextActive: {
    color: '#fff',
  },
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
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    participantName: { fontSize: 15, color: c.text, flexShrink: 1 },
    mutedHint: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    iconBtnDefault: { backgroundColor: c.surface },
    bottomBar: {
      flexDirection: 'row' as const,
      gap: 12,
      paddingVertical: 16,
      paddingHorizontal: 24,
      borderTopWidth: 1,
      borderTopColor: c.border,
      justifyContent: 'center' as const,
      alignItems: 'flex-end' as const,
    },
  };
}
