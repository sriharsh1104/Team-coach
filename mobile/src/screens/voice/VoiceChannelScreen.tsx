import React, {
  Component,
  ErrorInfo,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  Platform,
  Modal,
  StatusBar,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getToken } from '../../storage/tokenStorage';
import * as voiceApi from '../../api/voice';
import type { VoiceRoomKind } from '../../api/voice';
import { VoiceConfig, VoiceOccupant, VoiceRoom } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { useVoiceContext } from '../../voice/VoiceContext';
import { useVoiceOccupancy } from '../../voice/useVoiceOccupancy';
import { VoiceChannelController, VoiceParticipant, ConnectionQualityLevel } from '../../voice/types';
import { Screen } from '../../brand/Screen';
import { AppIcon } from '../../ui/AppIcon';
import { haptic } from '../../ui/haptics';
import { ButtonLabel } from '../../ui/ButtonLabel';
import { SkeletonList } from '../../ui/Skeleton';
import { emitToast } from '../../ui/toastBus';
import { ChannelAvatar } from '../chat/ChannelAvatar';
import { AudioOutputPicker } from './AudioOutputPicker';
import { MusicSharePicker } from './MusicSharePicker';
import { VoiceMoreSheet } from './VoiceMoreSheet';
import { VoicePingSheet } from './VoicePingSheet';
import { useSharedStyles } from '../shared';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import {
  VOICE_PRESETS,
  VoicePreset,
  getVoiceChangerStatus,
  getVoicePreset,
  isVoiceChangerAvailable,
  setVoicePreset,
} from '../../voice/voiceChanger';

function loadVideoView(): React.ComponentType<{
  videoTrack?: unknown;
  style?: object;
  objectFit?: 'cover' | 'contain';
}> | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@livekit/react-native').VideoView;
  } catch {
    return null;
  }
}

/** Easy − / + volume for one remote person (0–5 steps). Tap name to mute. */
function ParticipantVolumeControl({
  volume,
  onSetVolume,
  muted,
}: {
  volume: number;
  onSetVolume: (v: number) => void;
  muted: boolean;
}) {
  const step = Math.round(Math.max(0, Math.min(1, volume)) * 5);
  const bump = (delta: number) => {
    const next = Math.max(0, Math.min(5, step + delta));
    onSetVolume(next / 5);
  };
  return (
    <View style={styles.volRow}>
      <Pressable
        hitSlop={8}
        style={[styles.volBtn, step === 0 && styles.volBtnDisabled]}
        onPress={() => bump(-1)}
        disabled={step === 0}
        accessibilityLabel="Volume down"
      >
        <Text style={styles.volBtnText}>−</Text>
      </Pressable>
      <Text style={[styles.volLabel, muted && styles.volLabelMuted]}>
        {muted ? 'Mute' : `${step}/5`}
      </Text>
      <Pressable
        hitSlop={8}
        style={[styles.volBtn, step === 5 && styles.volBtnDisabled]}
        onPress={() => bump(1)}
        disabled={step === 5}
        accessibilityLabel="Volume up"
      >
        <Text style={styles.volBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

function ScreenShareViewer({
  voice,
}: {
  voice: VoiceChannelController;
}) {
  const share = voice.screenShare;
  const insets = useSafeAreaInsets();
  const [fullscreen, setFullscreen] = useState(false);
  const VideoView = useMemo(() => loadVideoView(), []);

  useEffect(() => {
    if (!share) setFullscreen(false);
  }, [share]);

  if (!share) return null;

  const title = share.isLocal
    ? 'You are sharing your screen'
    : `${share.participantName} is sharing`;
  // Android's getDisplayMedia is video-only, so the mic is the only audio
  // going out either way — saying "media audio" promised something we do
  // not send.
  const audioHint = share.isLocal
    ? 'Your mic keeps going — screen video only, no device audio'
    : 'Screen video — you still hear them on the mic';

  const videoNode =
    VideoView && share.videoTrack ? (
      <VideoView
        videoTrack={share.videoTrack}
        style={fullscreen ? styles.shareVideoFull : styles.shareVideo}
        objectFit="contain"
      />
    ) : (
      <View style={fullscreen ? styles.sharePlaceholderFull : styles.sharePlaceholder}>
        <Text style={styles.sharePlaceholderText}>
          {share.isLocal
            ? 'Others in this voice call can see your screen'
            : 'Waiting for video…'}
        </Text>
      </View>
    );

  const header = (
    <View style={[styles.shareHeader, fullscreen && { paddingTop: Math.max(insets.top, 8) }]}>
      <AppIcon name="phone-portrait-outline" size={14} color="#22c55e" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.shareHeaderText} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.shareAudioHint} numberOfLines={1}>
          {audioHint}
        </Text>
      </View>
      <Pressable
        onPress={() => setFullscreen((v) => !v)}
        hitSlop={10}
        accessibilityLabel={fullscreen ? 'Exit full screen' : 'Full screen'}
        style={styles.shareIconBtn}
      >
        <AppIcon name={fullscreen ? 'contract' : 'expand'} size={18} color="#fff" />
      </Pressable>
      {share.isLocal ? (
        <Pressable
          onPress={voice.toggleScreenShare}
          hitSlop={8}
          accessibilityLabel="Stop screen share"
        >
          <Text style={styles.shareStop}>Stop</Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <>
      <View style={styles.shareBox}>
        {header}
        <Pressable onPress={() => setFullscreen(true)} accessibilityLabel="Open full screen">
          {videoNode}
        </Pressable>
      </View>

      <Modal
        visible={fullscreen}
        animationType="fade"
        supportedOrientations={['portrait', 'landscape']}
        onRequestClose={() => setFullscreen(false)}
      >
        <StatusBar hidden={fullscreen} />
        <View style={styles.shareFullRoot}>
          {header}
          <View style={styles.shareFullBody}>{videoNode}</View>
          <View style={[styles.shareFullFooter, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Pressable
              style={styles.shareFullExit}
              onPress={() => setFullscreen(false)}
              accessibilityLabel="Exit full screen"
            >
              <AppIcon name="contract" size={18} color="#fff" />
              <Text style={styles.shareFullExitText}>Exit Full Screen</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

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
      isScreenSharing?: boolean;
      isHostMuted?: boolean;
      isModerator?: boolean;
      avatarUrl?: string | null;
      isSelf: true;
    };

/**
 * Voice changer chips (Android native build only). Works before joining and
 * mid-call — the effect sits on the mic path below both voice backends.
 */
function VoicePresetPicker({ inChannel }: { inChannel: boolean }) {
  const themed = useThemedStyles(voiceStyles);
  const [available] = useState(() => isVoiceChangerAvailable());
  const [preset, setPreset] = useState<VoicePreset>(() => getVoicePreset());
  // Whether audio is genuinely flowing through the effect. Picking a preset
  // and hearing no change used to be indistinguishable from the effect never
  // having attached — now the picker says which it is.
  const [live, setLive] = useState<boolean | null>(null);

  useEffect(() => {
    if (!available || preset === 'off' || !inChannel) {
      setLive(null);
      return;
    }
    // Poll briefly after a change: frames have to actually arrive before we
    // can say it is working, and that takes a beat.
    const seen = getVoiceChangerStatus()?.processedFrames ?? 0;
    let cancelled = false;
    const id = setInterval(() => {
      const status = getVoiceChangerStatus();
      if (cancelled || !status) return;
      if (status.layoutUnsupported) {
        setLive(false);
        return;
      }
      if (status.processedFrames > seen) setLive(true);
      else if (status.attached) setLive(false);
    }, 700);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [available, preset, inChannel]);

  if (!available) return null;

  const choose = (id: VoicePreset) => {
    if (id === preset) return;
    setLive(null);
    if (setVoicePreset(id)) setPreset(id);
  };

  return (
    <View style={styles.presetBlock}>
      <Text style={themed.sectionTitle}>Voice Morph</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.presetRow}
      >
        {VOICE_PRESETS.map((p) => {
          const active = p.id === preset;
          return (
            <Pressable
              key={p.id}
              onPress={() => choose(p.id)}
              style={[styles.presetChip, active && styles.presetChipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Voice: ${p.label}`}
            >
              <Text style={[styles.presetChipText, active && styles.presetChipTextActive]}>
                {p.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {preset !== 'off' && !inChannel && (
        <Text style={themed.mutedHint}>
          Morph applies when you join. Others hear it — your own ear may still sound normal.
        </Text>
      )}
      {preset !== 'off' && inChannel && live === true && (
        <Text style={themed.mutedHint}>Morph live — teammates hear the changed voice.</Text>
      )}
      {preset !== 'off' && inChannel && live === false && (
        <Text style={themed.mutedHint}>
          Morph not reaching the mic — leave and rejoin voice (needs Android app build, not Expo Go).
        </Text>
      )}
    </View>
  );
}

function VoiceChannelBody({
  voice,
  rooms,
  selectedRoom,
  onSelectRoom,
}: {
  voice: VoiceChannelController;
  rooms?: VoiceRoom[];
  selectedRoom: VoiceRoom | null;
  onSelectRoom: (room: VoiceRoom) => void;
}) {
  const { user, org } = useAuth();
  const { colors } = useTheme();
  const themed = useThemedStyles(voiceStyles);
  const inChannel = voice.status === 'connected';
  const roomKind = (voice.room ?? 'team') as VoiceRoomKind;
  // Peek at who is already inside before we join (Discord-style lobby).
  const { occupancy, refresh: refreshOccupancy } = useVoiceOccupancy(roomKind, {
    enabled: !inChannel,
  });

  // Joining is asynchronous and the mic can take a second to come up — a
  // pulse on the actual transition tells the user they're live without
  // making them watch the status text.
  const [pingOpen, setPingOpen] = useState(false);
  const [musicPickerOpen, setMusicPickerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // Pinging only makes sense for the team room — guild voice is org-wide, so
  // this would be a megaphone rather than a nudge to the people you want in.
  const canPing = inChannel && roomKind === 'team';

  const lastVoiceStatus = useRef(voice.status);
  useEffect(() => {
    const prev = lastVoiceStatus.current;
    lastVoiceStatus.current = voice.status;
    if (prev === voice.status) return;
    if (voice.status === 'connected') haptic('success');
    else if (prev === 'connected') haptic('light');
    else if (voice.status === 'error') haptic('error');
  }, [voice.status]);

  // Refresh once right before join so the lobby isn't stale.
  useEffect(() => {
    if (voice.status === 'idle') void refreshOccupancy();
  }, [voice.status, refreshOccupancy]);

  const isGuild = voice.room === 'guild';
  // Kick + announcement: owner only. Individual host-mute: owner / coach / guild leaders.
  const canKick = !!org?.isOwner;
  const canAnnounce = isGuild && !!org?.isOwner;
  const canHostMute = isGuild && !!voice.canModerate;

  const selfId = user?.id;
  const listData: ListItem[] = inChannel
    ? [
        {
          id: selfId ?? 'me',
          name: `${user?.name ?? 'You'} (You)`,
          avatarUrl: user?.avatarUrl,
          isLocallyMuted: voice.isMuted,
          isSpeaking: false,
          isHandRaised: voice.isLocalHandRaised,
          localVolume: 1,
          connectionQuality: 'excellent' as ConnectionQualityLevel,
          isScreenSharing: voice.isScreenSharing,
          isHostMuted: voice.isHostMuted,
          isModerator: isGuild && !!voice.canModerate,
          isSelf: true,
        },
        ...voice.participants
          .filter((p) => !selfId || p.id !== selfId)
          .map((p) => ({ ...p, isSelf: false as const })),
      ]
    : [];
  const lobbyOccupants: VoiceOccupant[] = !inChannel ? occupancy.participants : [];

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

        {/* Status only — title lives in the nav header (Team Voice / Guild Voice),
            so we don't repeat it here. No card chrome around the count. */}
        <View style={styles.channelStatus}>
          <Text style={styles.channelMeta}>
            {voice.status === 'connecting'
              ? 'Connecting…'
              : inChannel
                ? isGuild && voice.roomMax
                  ? `${voice.roomCount ?? voice.participants.length + 1} / ${voice.roomMax} in voice`
                  : `${voice.participants.length + 1} connected`
                : showMultipleRooms && !selectedRoom
                ? 'Select a room above to join'
                : lobbyOccupants.length > 0
                  ? occupancy.max
                    ? `${occupancy.count} / ${occupancy.max} already in voice`
                    : `${occupancy.count} already in voice`
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

        <VoicePresetPicker inChannel={inChannel} />

        {!inChannel && lobbyOccupants.length > 0 && (
          <>
            <Text style={themed.sectionTitle}>Already In Voice</Text>
            <FlatList
              data={lobbyOccupants}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <View style={themed.participantRow}>
                  <View style={styles.avatarWrapper}>
                    <View style={styles.avatar}>
                      <ChannelAvatar
                        uri={item.avatarUrl}
                        size={32}
                        fallback={(item.name[0] ?? '?').toUpperCase()}
                        previewable={false}
                      />
                    </View>
                  </View>
                  <View style={styles.participantInfo}>
                    <Text style={themed.participantName} numberOfLines={1}>
                      {item.name}
                    </Text>
                  </View>
                </View>
              )}
            />
          </>
        )}

        {inChannel && (
          <>
            {isGuild && voice.isListenOnly && (
              <View style={themed.banner}>
                <AppIcon name="megaphone" size={16} color={colors.chrome} />
                <Text style={themed.bannerText}>
                  {org?.isOwner
                    ? 'Announcement mode — everyone else is muted.'
                    : 'Announcement — only the owner can speak right now.'}
                </Text>
              </View>
            )}
            {isGuild && voice.isHostMuted && !voice.isListenOnly && (
              <View style={themed.banner}>
                <AppIcon name="mic-off" size={16} color={colors.danger} />
                <Text style={themed.bannerText}>A host muted you.</Text>
              </View>
            )}

            <ScreenShareViewer voice={voice} />

            {voice.musicShare ? (
              <View style={themed.musicBar}>
                <AppIcon name="musical-notes" size={18} color={colors.chrome} />
                <View style={styles.musicBarText}>
                  <Text style={themed.musicTitle} numberOfLines={1}>
                    {voice.musicShare.title}
                  </Text>
                  <Text style={themed.musicMeta} numberOfLines={1}>
                    {voice.musicShare.status === 'sending'
                      ? `Sending… ${Math.round(voice.musicShare.progress * 100)}%`
                      : voice.musicShare.isLocal
                        ? 'Playing for everyone'
                        : `${voice.musicShare.fromName} is sharing`}
                  </Text>
                </View>
                {voice.musicShare.isLocal && (
                  <Pressable
                    onPress={() => {
                      haptic('light');
                      voice.stopMusicShare();
                    }}
                    hitSlop={8}
                    accessibilityLabel="Stop music"
                  >
                    <Text style={themed.musicStop}>Stop</Text>
                  </Pressable>
                )}
              </View>
            ) : null}

            <View style={styles.sectionRow}>
              <Text style={themed.sectionTitle}>In Channel</Text>
              {canPing && (
                <Pressable
                  style={styles.pingBtn}
                  onPress={() => {
                    haptic('light');
                    setPingOpen(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Ping teammates to join voice"
                >
                  <ButtonLabel icon="person-add" color="#22c55e">
                    Ping
                  </ButtonLabel>
                </Pressable>
              )}
            </View>
            <FlatList
              data={listData}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <View style={themed.participantRow}>
                  {/* Tap name/avatar → mute/unmute for you */}
                  <Pressable
                    style={styles.participantTap}
                    disabled={item.isSelf}
                    onPress={
                      item.isSelf
                        ? undefined
                        : () => voice.toggleParticipantMute(item.id)
                    }
                    accessibilityRole={item.isSelf ? undefined : 'button'}
                    accessibilityLabel={
                      item.isSelf
                        ? undefined
                        : item.isLocallyMuted
                          ? `Unmute ${item.name} for you`
                          : `Mute ${item.name} for you`
                    }
                  >
                    <View style={styles.avatarWrapper}>
                      {item.isSpeaking && <SpeakingRing />}
                      <View
                        style={[
                          styles.avatar,
                          item.isSpeaking && styles.avatarSpeaking,
                        ]}
                      >
                        <ChannelAvatar
                          uri={item.avatarUrl}
                          size={32}
                          fallback={(item.name[0] ?? '?').toUpperCase()}
                          previewable={false}
                        />
                      </View>
                      {item.isHandRaised && (
                        <View style={styles.handRaisedBadge}>
                          <AppIcon name="hand-raised" size={10} color="#fff" />
                        </View>
                      )}
                    </View>

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
                      {item.isScreenSharing && (
                        <Text style={themed.mutedHint}>Sharing screen</Text>
                      )}
                      {isGuild && (item.isModerator || item.isHostMuted) && (
                        <Text style={themed.mutedHint}>
                          {item.isModerator ? 'Host' : 'Muted by host'}
                        </Text>
                      )}
                    </View>
                  </Pressable>

                  {/* Local volume for this person (everyone can adjust) */}
                  {!item.isSelf && (
                    <ParticipantVolumeControl
                      volume={item.localVolume}
                      muted={item.isLocallyMuted}
                      onSetVolume={(v) => voice.setParticipantVolume(item.id, v)}
                    />
                  )}

                  {/* Guild host: mute / unmute this person for everyone */}
                  {!item.isSelf && canHostMute && !item.isModerator && (
                    <Pressable
                      hitSlop={8}
                      style={styles.kickBtn}
                      onPress={() => voice.setParticipantHostMuted?.(item.id, !item.isHostMuted)}
                      accessibilityLabel={`${item.isHostMuted ? 'Unmute' : 'Mute'} ${item.name} for everyone`}
                    >
                      <AppIcon
                        name={item.isHostMuted ? 'mic' : 'mic-off'}
                        size={16}
                        color={item.isHostMuted ? '#23a559' : '#f59e0b'}
                      />
                    </Pressable>
                  )}

                  {/* Kick — org owner only */}
                  {!item.isSelf && canKick && (
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

            {/* Bottom bar: [Hand] [Mic] [Audio] [Deafen] [Announce?] [⋮] [Leave]
                Screen + music share live under ⋮ so speaker vs deafen stay obvious. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={themed.bottomBar}
              style={styles.bottomBarScroll}
            >
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
                    voice.isMuted || voice.isHostMuted ? styles.iconBtnDanger : themed.iconBtnDefault,
                  ]}
                  onPress={voice.isPushToTalk ? undefined : voice.toggleMute}
                  onPressIn={voice.isPushToTalk ? voice.pttStart : undefined}
                  onPressOut={voice.isPushToTalk ? voice.pttStop : undefined}
                  onLongPress={voice.togglePushToTalk}
                  delayLongPress={600}
                  accessibilityLabel={
                    voice.isHostMuted
                      ? 'Muted by host'
                      : voice.isPushToTalk
                      ? 'Hold to talk'
                      : voice.isMuted
                      ? 'Unmute mic'
                      : 'Mute mic'
                  }
                >
                  <AppIcon
                    name={voice.isMuted || voice.isHostMuted ? 'mic-off' : 'mic'}
                    size={22}
                    color="#fff"
                  />
                </Pressable>
                {voice.isPushToTalk && (
                  <Text style={styles.pttLabel}>HOLD</Text>
                )}
              </View>

              {/* Announcement — mute everyone, owner stays open (guild owner only) */}
              {canAnnounce ? (
                <Pressable
                  style={[
                    styles.iconBtn,
                    voice.isListenOnly ? styles.iconBtnActive : themed.iconBtnDefault,
                  ]}
                  onPress={() => {
                    haptic('medium');
                    if (voice.isListenOnly) voice.unmuteAll?.();
                    else voice.muteAll?.();
                  }}
                  accessibilityLabel={
                    voice.isListenOnly
                      ? 'End announcement — let everyone talk'
                      : 'Announce — mute everyone else'
                  }
                >
                  <AppIcon name="megaphone" size={22} color="#fff" />
                </Pressable>
              ) : null}

              {/* Audio output: speakerphone / phone / headphones / bluetooth
                  (speaker box icon — not the same as deafen’s volume cone) */}
              <AudioOutputPicker
                enabled={inChannel}
                style={StyleSheet.flatten([styles.iconBtn, themed.iconBtnDefault])}
              />

              {/* Deafen — silence everyone else’s voice for you only */}
              <Pressable
                style={[
                  styles.iconBtn,
                  voice.isDeafened ? styles.iconBtnDanger : themed.iconBtnDefault,
                ]}
                onPress={voice.toggleDeafen}
                accessibilityLabel={
                  voice.isDeafened
                    ? 'Hear others again'
                    : 'Silence others — mute their audio for you'
                }
              >
                <AppIcon
                  name={voice.isDeafened ? 'volume-mute' : 'volume-high'}
                  size={22}
                  color="#fff"
                />
              </Pressable>

              {/* ⋮ — screen share + music share */}
              <Pressable
                style={[
                  styles.iconBtn,
                  voice.isScreenSharing || voice.musicShare?.isLocal
                    ? styles.iconBtnActive
                    : themed.iconBtnDefault,
                ]}
                onPress={() => setMoreOpen(true)}
                accessibilityLabel="Call options"
              >
                <AppIcon name="ellipsis-vertical" size={22} color="#fff" />
              </Pressable>

              {/* Disconnect */}
              <Pressable
                style={[styles.iconBtn, styles.iconBtnDanger]}
                onPress={voice.leave}
                accessibilityLabel="Disconnect"
              >
                <AppIcon name="phone-down" size={22} color="#fff" />
              </Pressable>
            </ScrollView>

            <VoiceMoreSheet
              visible={moreOpen}
              onClose={() => setMoreOpen(false)}
              isScreenSharing={voice.isScreenSharing}
              musicShareLocal={!!voice.musicShare?.isLocal}
              musicShareBusy={!!voice.musicShare && !voice.musicShare.isLocal}
              onToggleScreenShare={voice.toggleScreenShare}
              onMusicPress={() => {
                if (voice.musicShare?.isLocal) {
                  voice.stopMusicShare();
                  return;
                }
                if (voice.musicShare) {
                  emitToast('Someone is already sharing music');
                  return;
                }
                setMusicPickerOpen(true);
              }}
            />

            <MusicSharePicker
              visible={musicPickerOpen}
              onClose={() => setMusicPickerOpen(false)}
              onPick={(pick) => voice.startMusicShare(pick)}
            />

            <VoicePingSheet
              visible={pingOpen}
              onClose={() => setPingOpen(false)}
              selfUserId={user?.id ?? null}
              inCallUserIds={listData.map((p) => p.id)}
            />
          </>
        )}
      </View>
    </Screen>
  );
}

function HostedVoiceChannel({
  config,
  room,
  peer,
}: {
  config: Extract<VoiceConfig, { mode: 'hosted' }>;
  room: VoiceRoomKind;
  /** 1-on-1 only: who is on the other end. */
  peer?: { id: string; name: string };
}) {
  const { activate, deactivate, controller, activationRoom, setScreenFocused } =
    useVoiceContext();
  const { colors } = useTheme();
  const shared = useSharedStyles();

  const hasMultipleRooms = config.rooms && config.rooms.length > 1;
  const [selectedRoom, setSelectedRoom] = useState<VoiceRoom | null>(() => {
    if (config.rooms && config.rooms.length === 1) return config.rooms[0];
    return null;
  });

  const effectiveUrl = selectedRoom ? selectedRoom.url : config.url;
  const effectiveToken = selectedRoom ? selectedRoom.token : config.token;
  const canModerate = config.canModerate;
  const max = config.max;

  // Activate (or reactivate) in the global VoiceContext whenever url/token change.
  // This is what mounts HostedVoiceHolder above the navigator, keeping the
  // LiveKit Room alive when the user navigates away.
  // hasSession in the deps: leaving a call now drops the provider's holder,
  // so without this the screen sat on the skeleton below with no way back to
  // the Join button (nothing else re-runs while the screen stays focused).
  const hasSession = !!controller;
  const peerId = peer?.id;
  const peerName = peer?.name;
  useEffect(() => {
    activate({
      mode: 'hosted',
      url: effectiveUrl,
      token: effectiveToken,
      room,
      canModerate,
      max,
      peerId,
      peerName,
    });
  }, [
    effectiveUrl,
    effectiveToken,
    room,
    canModerate,
    max,
    peerId,
    peerName,
    activate,
    hasSession,
  ]);

  // Track screen focus so VoiceFloatingWidget only shows when user has
  // navigated away from this screen.
  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      // Re-activate if the user left via the floating widget then came back
      activate({
        mode: 'hosted',
        url: effectiveUrl,
        token: effectiveToken,
        room,
        canModerate,
        max,
        peerId,
        peerName,
      });
      return () => {
        setScreenFocused(false);
      };
    }, [
      effectiveUrl,
      effectiveToken,
      room,
      canModerate,
      max,
      peerId,
      peerName,
      activate,
      setScreenFocused,
    ]),
  );

  // The shared session may still be the other room's (team ↔ guild) for one
  // render before the provider swaps holders — don't show its controls here.
  // Only show Leave & Switch when the provider is intentionally still holding
  // the other live room (activate refused to swap). A stale controller during
  // remount must not flash that gate / toast-like message.
  if (!controller || (controller.room ?? 'team') !== room) {
    const sessionRoom = activationRoom ?? (controller?.room as VoiceRoomKind | undefined);
    const live =
      !!controller &&
      (controller.status === 'connected' || controller.status === 'connecting');
    const blockedOnOther =
      live &&
      !!sessionRoom &&
      sessionRoom !== room &&
      (controller.room ?? 'team') === sessionRoom;
    if (blockedOnOther) {
      return (
        <RoomSwitchGate
          currentRoom={sessionRoom}
          targetRoom={room}
          onSwitch={() => {
            deactivate();
            activate({
              mode: 'hosted',
              url: effectiveUrl,
              token: effectiveToken,
              room,
              canModerate,
              max,
            });
          }}
        />
      );
    }
    return (
      <Screen>
        <View style={[shared.container, { justifyContent: 'flex-start', paddingTop: 24 }]}>
          <SkeletonList count={5} avatarSize={40} />
        </View>
      </Screen>
    );
  }

  const handleSelectRoom = (room: VoiceRoom) => {
    // deactivate cleans up the current HostedVoiceHolder; the useEffect above
    // will re-activate with the new room's url/token after selectedRoom changes.
    deactivate();
    setSelectedRoom(room);
  };

  return (
    <VoiceChannelBody
      voice={controller}
      rooms={hasMultipleRooms ? config.rooms : undefined}
      selectedRoom={selectedRoom}
      onSelectRoom={handleSelectRoom}
    />
  );
}

function SelfHostedVoiceChannel({
  authToken,
  room,
}: {
  authToken: string;
  // Self-hosted voice has no 1-on-1 room — the backend refuses `direct` on
  // that path, so this screen never sees it.
  room: 'team' | 'guild';
}) {
  const { activate, deactivate, controller, activationRoom, setScreenFocused } =
    useVoiceContext();
  const shared = useSharedStyles();

  // Mount the mediasoup session in the global VoiceContext (above the
  // navigator) so it keeps running when the user navigates away — same as
  // the hosted path. See SelfHostedVoiceHolder in VoiceContext.tsx.
  // hasSession: see the hosted path — leaving drops the holder, and without
  // this dep the screen would stay stuck on the skeleton below.
  const hasSession = !!controller;
  useEffect(() => {
    activate({ mode: 'self', token: authToken, room });
  }, [authToken, room, activate, hasSession]);

  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      activate({ mode: 'self', token: authToken, room });
      return () => {
        setScreenFocused(false);
      };
    }, [authToken, room, activate, setScreenFocused]),
  );

  // Same gate rules as hosted — see HostedVoiceChannel above.
  if (!controller || (controller.room ?? 'team') !== room) {
    const sessionRoom = activationRoom ?? (controller?.room as VoiceRoomKind | undefined);
    const live =
      !!controller &&
      (controller.status === 'connected' || controller.status === 'connecting');
    const blockedOnOther =
      live &&
      !!sessionRoom &&
      sessionRoom !== room &&
      (controller.room ?? 'team') === sessionRoom;
    if (blockedOnOther) {
      return (
        <RoomSwitchGate
          currentRoom={sessionRoom}
          targetRoom={room}
          onSwitch={() => {
            deactivate();
            activate({ mode: 'self', token: authToken, room });
          }}
        />
      );
    }
    return (
      <Screen>
        <View style={[shared.container, { justifyContent: 'flex-start', paddingTop: 24 }]}>
          <SkeletonList count={5} avatarSize={40} />
        </View>
      </Screen>
    );
  }

  return (
    <VoiceChannelBody
      voice={controller}
      rooms={undefined}
      selectedRoom={null}
      onSelectRoom={() => {}}
    />
  );
}

/** Shown when the user opens Team/Guild Voice while already live in the other. */
function RoomSwitchGate({
  currentRoom,
  targetRoom,
  onSwitch,
}: {
  currentRoom: VoiceRoomKind;
  targetRoom: VoiceRoomKind;
  onSwitch: () => void;
}) {
  const shared = useSharedStyles();
  const { colors } = useTheme();
  const currentLabel = currentRoom === 'guild' ? 'Guild Voice' : 'Team Voice';
  const targetLabel = targetRoom === 'guild' ? 'Guild Voice' : 'Team Voice';
  return (
    <Screen>
      <View style={[shared.container, { justifyContent: 'center', gap: 12 }]}>
        <Text style={[shared.title, { textAlign: 'center' }]}>Already In {currentLabel}</Text>
        <Text style={{ color: colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 8 }}>
          Leave {currentLabel} first if you want to join {targetLabel}. Switching drops your
          current call.
        </Text>
        <Pressable
          style={shared.button}
          onPress={onSwitch}
          accessibilityLabel={`Leave ${currentLabel} and join ${targetLabel}`}
        >
          <Text style={shared.buttonText}>Leave & Switch</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function VoiceChannelScreenInner({
  room,
  peer,
}: {
  room: VoiceRoomKind;
  /** 1-on-1 only: who is on the other end. */
  peer?: { id: string; name: string };
}) {
  const shared = useSharedStyles();
  const { colors } = useTheme();
  const [config, setConfig] = useState<VoiceConfig | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Only used as a probe that the native voice modules load (require throws
  // otherwise) — the actual hooks are mounted by VoiceContext's holders.
  const [hooks, setHooks] = useState<VoiceHooks | null>(null);
  const [nativeError, setNativeError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([voiceApi.getVoiceConfig(room, peer?.id), getToken()])
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
  }, [room, peer?.id]);

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
        <View style={[shared.container, { justifyContent: 'flex-start', paddingTop: 24 }]}>
          <SkeletonList count={5} avatarSize={40} />
        </View>
      </Screen>
    );
  }

  return config.mode === 'hosted' ? (
    <HostedVoiceChannel config={config} room={room} peer={peer} />
  ) : (
    // `direct` never reaches here: the backend only serves it on hosted
    // voice, so a self-hosted config means team or guild.
    <SelfHostedVoiceChannel
      authToken={authToken}
      room={room === 'guild' ? 'guild' : 'team'}
    />
  );
}

export function VoiceScreenRoot({
  room,
  peer,
}: {
  room: VoiceRoomKind;
  peer?: { id: string; name: string };
}) {
  const [key, setKey] = useState(0);
  return (
    <VoiceErrorBoundary onRetry={() => setKey((k) => k + 1)}>
      <VoiceChannelScreenInner key={key} room={room} peer={peer} />
    </VoiceErrorBoundary>
  );
}

export function VoiceChannelScreen() {
  return <VoiceScreenRoot room="team" />;
}

/** Guild-wide voice: up to 50 people, host mute-all / per-person mute. */
export function GuildVoiceScreen() {
  return <VoiceScreenRoot room="guild" />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  shareBox: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
  },
  shareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(34,197,94,0.12)',
  },
  shareHeaderText: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '600',
  },
  shareAudioHint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    marginTop: 1,
  },
  shareIconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareStop: {
    color: '#ef4444',
    fontWeight: '700',
    fontSize: 13,
  },
  shareVideo: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  shareVideoFull: {
    flex: 1,
    width: '100%',
    backgroundColor: '#000',
  },
  sharePlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  sharePlaceholderFull: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  sharePlaceholderText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    textAlign: 'center',
  },
  shareFullRoot: {
    flex: 1,
    backgroundColor: '#000',
  },
  shareFullBody: {
    flex: 1,
  },
  shareFullFooter: {
    paddingHorizontal: 16,
    paddingTop: 8,
    alignItems: 'center',
  },
  shareFullExit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  shareFullExitText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  channelStatus: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  channelMeta: { color: '#b5bac1', fontSize: 14, marginBottom: 12 },
  joinButton: {
    backgroundColor: '#23a559',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
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
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarSpeaking: {
    borderColor: '#23a559',
  },
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
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  pingBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(34,197,94,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
  },
  participantTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    gap: 10,
  },
  volRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 4,
  },
  volBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  volBtnDisabled: {
    opacity: 0.35,
  },
  volBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
  },
  volLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '700',
    minWidth: 36,
    textAlign: 'center',
  },
  volLabelMuted: {
    color: '#f59e0b',
  },
  // Kick button
  kickBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  musicBarText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  bottomBarScroll: {
    flexGrow: 0,
  },
  // Compact icon-only action buttons
  iconBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
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
  // Guild voice host controls
  hostPanel: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  hostBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  hostBtnDanger: { backgroundColor: '#dc2626' },
  hostBtnOff: { backgroundColor: '#6b7280', opacity: 0.6 },
  hostBtnGreen: { backgroundColor: '#23a559' },
  // Voice changer presets
  presetBlock: { marginBottom: 8 },
  presetRow: { paddingHorizontal: 16, gap: 8 },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#2d2f33',
    borderWidth: 1,
    borderColor: '#3f4248',
  },
  presetChipActive: {
    backgroundColor: '#23a559',
    borderColor: '#23a559',
  },
  presetChipText: { color: '#b5bac1', fontSize: 13, fontWeight: '600' },
  presetChipTextActive: { color: '#fff' },
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
    banner: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    bannerText: { flex: 1, fontSize: 13, color: c.text },
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
    musicBar: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 10,
      marginHorizontal: 16,
      marginBottom: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    musicTitle: { fontSize: 14, fontWeight: '600' as const, color: c.text },
    musicMeta: { fontSize: 12, color: c.textMuted },
    musicStop: { fontSize: 13, fontWeight: '700' as const, color: c.danger },
    bottomBar: {
      flexDirection: 'row' as const,
      gap: 10,
      paddingVertical: 16,
      paddingHorizontal: 16,
      borderTopWidth: 1,
      borderTopColor: c.border,
      justifyContent: 'center' as const,
      alignItems: 'flex-end' as const,
    },
  };
}
