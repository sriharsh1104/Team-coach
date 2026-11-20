import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { AudioSession, AndroidAudioTypePresets } from '@livekit/react-native';
import {
  Room,
  RoomEvent,
  RemoteParticipant,
  Participant,
  ConnectionQuality,
  DisconnectReason,
} from 'livekit-client';
import { moderateVoice } from '../api/voice';
import { emitToast } from '../ui/toastBus';
import {
  VoiceChannelController,
  VoiceChannelStatus,
  VoiceParticipant,
  ConnectionQualityLevel,
} from './types';
import { attachVoiceChanger } from './voiceChanger';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function mapConnectionQuality(q: ConnectionQuality): ConnectionQualityLevel {
  switch (q) {
    case ConnectionQuality.Excellent:
      return 'excellent';
    case ConnectionQuality.Good:
      return 'good';
    case ConnectionQuality.Poor:
      return 'poor';
    case ConnectionQuality.Lost:
      return 'lost';
    default:
      return 'unknown';
  }
}

// Only hand-raise travels as a data message. Kick / mute used to be
// client-sent data messages that any modified client could fake; they now go
// through POST /voice/moderate and are enforced by the server.
type DataMsg = { type: 'hand_raise'; raised: boolean };

/** Mirror of backend hosted-room-state (kept tiny on purpose). */
type RoomState = { listenOnly: boolean; muted: string[]; speakers: string[] };
const EMPTY_STATE: RoomState = { listenOnly: false, muted: [], speakers: [] };

function parseRoomState(metadata: string | undefined): RoomState {
  if (!metadata) return EMPTY_STATE;
  try {
    const raw = JSON.parse(metadata) as Partial<RoomState>;
    return {
      listenOnly: raw.listenOnly === true,
      muted: Array.isArray(raw.muted) ? raw.muted : [],
      speakers: Array.isArray(raw.speakers) ? raw.speakers : [],
    };
  } catch {
    return EMPTY_STATE;
  }
}

function isModeratorParticipant(p: Participant): boolean {
  return p.attributes?.mod === '1';
}

function errorText(err: unknown): string {
  const e = err as { response?: { data?: { message?: unknown } }; message?: string };
  const m = e?.response?.data?.message;
  if (typeof m === 'string' && m) return m;
  if (Array.isArray(m) && typeof m[0] === 'string') return m[0];
  return e?.message || 'Could not do that. Try again.';
}

export type HostedVoiceOptions = {
  room?: 'team' | 'guild';
  /** From the server's token response — never derived on the client. */
  canModerate?: boolean;
  max?: number;
};

export function useHostedVoiceChannel(
  url: string,
  token: string,
  options: HostedVoiceOptions = {},
): VoiceChannelController {
  const voiceRoom = options.room ?? 'team';
  const isGuild = voiceRoom === 'guild';
  const [status, setStatus] = useState<VoiceChannelStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isLocalHandRaised, setIsLocalHandRaised] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isPushToTalk, setIsPushToTalk] = useState(false);
  // Guild voice: host-mute state, derived from room metadata + server permissions.
  const [roomState, setRoomState] = useState<RoomState>(EMPTY_STATE);
  const [isHostMuted, setIsHostMuted] = useState(false);
  const isHostMutedRef = useRef(false);
  const roomStateRef = useRef<RoomState>(EMPTY_STATE);

  const roomRef = useRef<Room | null>(null);
  // Per-participant local volumes (0-1); default 1 until changed
  const localVolumesRef = useRef<Map<string, number>>(new Map());
  // Participants who have raised their hand
  const handRaisedIdsRef = useRef<Set<string>>(new Set());
  // Active speaking participants
  const speakingIdsRef = useRef<Set<string>>(new Set());
  // Per-participant connection quality
  const connectionQualitiesRef = useRef<Map<string, ConnectionQualityLevel>>(new Map());
  // Track deafen state in a ref for use inside callbacks
  const isDeafenedRef = useRef(false);
  const isPushToTalkRef = useRef(false);

  const syncParticipants = useCallback((room: Room) => {
    setParticipants(
      [...room.remoteParticipants.values()].map((p: RemoteParticipant) => {
        const vol = localVolumesRef.current.get(p.identity) ?? 1;
        return {
          id: p.identity,
          name: p.name || p.identity,
          isLocallyMuted: vol === 0,
          isSpeaking: speakingIdsRef.current.has(p.identity),
          isHandRaised: handRaisedIdsRef.current.has(p.identity),
          localVolume: vol,
          connectionQuality: connectionQualitiesRef.current.get(p.identity) ?? 'unknown',
          ...(isGuild
            ? {
                isModerator: isModeratorParticipant(p),
                isHostMuted:
                  !isModeratorParticipant(p) &&
                  (roomStateRef.current.muted.includes(p.identity) ||
                    (roomStateRef.current.listenOnly &&
                      !roomStateRef.current.speakers.includes(p.identity))),
              }
            : {}),
        };
      }),
    );
  }, [isGuild]);

  const publishData = useCallback((msg: DataMsg, destinationIdentities?: string[]) => {
    const room = roomRef.current;
    if (!room) return;
    const opts: { reliable: boolean; destinationIdentities?: string[] } = { reliable: true };
    if (destinationIdentities) opts.destinationIdentities = destinationIdentities;
    room.localParticipant
      .publishData(encoder.encode(JSON.stringify(msg)), opts)
      .catch((err) => console.warn('publishData error:', err));
  }, []);

  const leave = useCallback(() => {
    roomRef.current?.disconnect();
    roomRef.current = null;
    AudioSession.stopAudioSession().catch(() => {});
    localVolumesRef.current.clear();
    handRaisedIdsRef.current.clear();
    speakingIdsRef.current.clear();
    connectionQualitiesRef.current.clear();
    setStatus('idle');
    setParticipants([]);
    setIsMuted(false);
    setIsLocalHandRaised(false);
    setIsDeafened(false);
    setIsPushToTalk(false);
    isDeafenedRef.current = false;
    isPushToTalkRef.current = false;
    roomStateRef.current = EMPTY_STATE;
    isHostMutedRef.current = false;
    setRoomState(EMPTY_STATE);
    setIsHostMuted(false);
  }, []);

  const joiningRef = useRef(false);

  const join = useCallback(async () => {
    // A double tap used to open two Rooms that fought over the mic.
    if (joiningRef.current) return;
    joiningRef.current = true;
    // Rejoin (after an error / kick): close the old Room before opening a new one.
    if (roomRef.current) {
      roomRef.current.removeAllListeners();
      await roomRef.current.disconnect().catch(() => undefined);
      roomRef.current = null;
    }
    setStatus('connecting');
    localVolumesRef.current.clear();
    handRaisedIdsRef.current.clear();
    speakingIdsRef.current.clear();
    connectionQualitiesRef.current.clear();
    setIsLocalHandRaised(false);
    setIsDeafened(false);
    setIsPushToTalk(false);
    isDeafenedRef.current = false;
    isPushToTalkRef.current = false;
    try {
      const room = new Room();
      roomRef.current = room;

      room.on(RoomEvent.ParticipantConnected, () => syncParticipants(room));
      room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
        localVolumesRef.current.delete(p.identity);
        handRaisedIdsRef.current.delete(p.identity);
        speakingIdsRef.current.delete(p.identity);
        connectionQualitiesRef.current.delete(p.identity);
        syncParticipants(room);
      });
      room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
        if (reason === DisconnectReason.PARTICIPANT_REMOVED) {
          emitToast('You were removed from the voice channel by a host.');
        }
        setStatus('idle');
        setParticipants([]);
        setIsMuted(false);
        setIsLocalHandRaised(false);
        setIsDeafened(false);
        setIsPushToTalk(false);
        isDeafenedRef.current = false;
        isPushToTalkRef.current = false;
        speakingIdsRef.current.clear();
      });
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        speakingIdsRef.current = new Set(
          speakers
            .filter((s) => !s.isLocal)
            .map((s) => s.identity),
        );
        syncParticipants(room);
      });
      room.on(
        RoomEvent.ConnectionQualityChanged,
        (quality: ConnectionQuality, participant: Participant) => {
          if (!participant.isLocal) {
            connectionQualitiesRef.current.set(
              participant.identity,
              mapConnectionQuality(quality),
            );
            syncParticipants(room);
          }
        },
      );
      // Guild host-mute: the room metadata carries the mute list, permissions
      // carry the server-enforced result for this device.
      const refreshHostMuted = () => {
        const canPublish = room.localParticipant.permissions?.canPublish !== false;
        const muted = !canPublish;
        if (muted && !isHostMutedRef.current) {
          // Server just revoked our mic — reflect it locally.
          setIsMuted(true);
          emitToast('A host muted you. Raise your hand to ask for the mic.');
        }
        isHostMutedRef.current = muted;
        setIsHostMuted(muted);
      };
      if (isGuild) {
        room.on(RoomEvent.RoomMetadataChanged, (metadata: string) => {
          const next = parseRoomState(metadata);
          roomStateRef.current = next;
          setRoomState(next);
          syncParticipants(room);
        });
        room.on(RoomEvent.ParticipantAttributesChanged, () => syncParticipants(room));
        room.on(RoomEvent.ParticipantPermissionsChanged, (_prev, participant) => {
          if (participant?.isLocal) refreshHostMuted();
          syncParticipants(room);
        });
      }
      room.on(
        RoomEvent.DataReceived,
        (payload: Uint8Array, participant?: RemoteParticipant) => {
          try {
            const msg = JSON.parse(decoder.decode(payload)) as DataMsg;
            if (msg.type === 'hand_raise' && participant) {
              if (msg.raised) {
                handRaisedIdsRef.current.add(participant.identity);
              } else {
                handRaisedIdsRef.current.delete(participant.identity);
              }
              syncParticipants(room);
            }
          } catch {
            // Ignore malformed data messages
          }
        },
      );

      // Call-style audio routing (speaker/earpiece/bluetooth, Android
      // VOICE_COMMUNICATION mode). LiveKit RN needs this started explicitly.
      try {
        await AudioSession.configureAudio({
          android: { audioTypeOptions: AndroidAudioTypePresets.communication },
        });
        await AudioSession.startAudioSession();
      } catch (err) {
        console.warn('AudioSession setup failed (continuing):', err);
      }
      await room.connect(url, token);
      if (roomRef.current !== room) {
        // Left (or unmounted) while we were still connecting.
        room.removeAllListeners();
        await room.disconnect().catch(() => undefined);
        return;
      }
      if (isGuild) {
        const initial = parseRoomState(room.metadata);
        roomStateRef.current = initial;
        setRoomState(initial);
      }
      // Joined while muted by a host (the token has no publish right): stay
      // silent instead of failing the whole join on the mic publish.
      const startMuted = room.localParticipant.permissions?.canPublish === false;
      isHostMutedRef.current = startMuted;
      setIsHostMuted(startMuted);
      if (!startMuted) {
        await room.localParticipant.setMicrophoneEnabled(true);
        attachVoiceChanger();
      }
      syncParticipants(room);
      setIsMuted(startMuted);
      setStatus('connected');
    } catch (err: any) {
      // Don't leave a half-connected Room holding the mic / audio session.
      const failed = roomRef.current;
      roomRef.current = null;
      failed?.removeAllListeners();
      failed?.disconnect().catch(() => undefined);
      AudioSession.stopAudioSession().catch(() => {});
      setErrorMessage(err?.message ?? 'Could not join voice channel');
      setStatus('error');
    } finally {
      joiningRef.current = false;
    }
  }, [url, token, isGuild, syncParticipants]);

  const toggleMute = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    // Don't toggle mic when deafened; deafen controls mic in that case
    if (isDeafenedRef.current) return;
    // Don't toggle mic in PTT mode; pttStart/pttStop control it
    if (isPushToTalkRef.current) return;
    if (isHostMutedRef.current) {
      emitToast('A host muted you. Raise your hand to ask for the mic.');
      return;
    }
    setIsMuted((prev) => {
      const nextMuted = !prev;
      room.localParticipant.setMicrophoneEnabled(!nextMuted).then(
        () => {
          if (!nextMuted) attachVoiceChanger();
        },
        (err) => console.warn('mic toggle failed:', err),
      );
      return nextMuted;
    });
  }, []);

  const setParticipantVolume = useCallback(
    (participantId: string, volume: number) => {
      const room = roomRef.current;
      if (!room) return;
      const participant = room.remoteParticipants.get(participantId);
      const clamped = Math.max(0, Math.min(1, volume));
      localVolumesRef.current.set(participantId, clamped);
      if (participant && !isDeafenedRef.current) {
        participant.setVolume(clamped);
      }
      syncParticipants(room);
    },
    [syncParticipants],
  );

  const toggleParticipantMute = useCallback(
    (participantId: string) => {
      const currentVol = localVolumesRef.current.get(participantId) ?? 1;
      const nextVol = currentVol === 0 ? 1 : 0;
      setParticipantVolume(participantId, nextVol);
    },
    [setParticipantVolume],
  );

  const toggleHandRaise = useCallback(() => {
    setIsLocalHandRaised((prev) => {
      const next = !prev;
      publishData({ type: 'hand_raise', raised: next });
      return next;
    });
  }, [publishData]);

  const hostAction = useCallback(
    (action: 'muteAll' | 'unmuteAll' | 'mute' | 'unmute' | 'kick', userId?: string) => {
      moderateVoice(voiceRoom, action, userId).catch((err) => {
        console.warn(`voice ${action} failed:`, err);
        emitToast(errorText(err));
      });
    },
    [voiceRoom],
  );

  const kickParticipant = useCallback(
    (participantId: string) => hostAction('kick', participantId),
    [hostAction],
  );
  const muteAll = useCallback(() => hostAction('muteAll'), [hostAction]);
  const unmuteAll = useCallback(() => hostAction('unmuteAll'), [hostAction]);
  const setParticipantHostMuted = useCallback(
    (id: string, muted: boolean) => hostAction(muted ? 'mute' : 'unmute', id),
    [hostAction],
  );

  const toggleDeafen = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    setIsDeafened((prev) => {
      const nextDeafened = !prev;
      isDeafenedRef.current = nextDeafened;
      if (nextDeafened) {
        // Mute all remote participants and mute local mic
        for (const p of room.remoteParticipants.values()) {
          p.setVolume(0);
        }
        room.localParticipant.setMicrophoneEnabled(false);
        setIsMuted(true);
      } else {
        // Restore local volumes
        for (const p of room.remoteParticipants.values()) {
          const vol = localVolumesRef.current.get(p.identity) ?? 1;
          p.setVolume(vol);
        }
        // Restore mic (unless in PTT mode where mic stays gated)
        if (!isPushToTalkRef.current && !isHostMutedRef.current) {
          room.localParticipant.setMicrophoneEnabled(true);
          setIsMuted(false);
        }
      }
      return nextDeafened;
    });
  }, []);

  const togglePushToTalk = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    setIsPushToTalk((prev) => {
      const nextPTT = !prev;
      isPushToTalkRef.current = nextPTT;
      if (nextPTT) {
        // Entering PTT mode: mute mic immediately
        room.localParticipant.setMicrophoneEnabled(false);
        setIsMuted(true);
      } else {
        // Leaving PTT mode: restore mic (if not deafened)
        if (!isDeafenedRef.current && !isHostMutedRef.current) {
          room.localParticipant.setMicrophoneEnabled(true);
          setIsMuted(false);
        }
      }
      return nextPTT;
    });
  }, []);

  const pttStart = useCallback(() => {
    const room = roomRef.current;
    if (!room || !isPushToTalkRef.current || isDeafenedRef.current) return;
    if (isHostMutedRef.current) {
      emitToast('A host muted you. Raise your hand to ask for the mic.');
      return;
    }
    room.localParticipant.setMicrophoneEnabled(true);
    setIsMuted(false);
  }, []);

  const pttStop = useCallback(() => {
    const room = roomRef.current;
    if (!room || !isPushToTalkRef.current) return;
    room.localParticipant.setMicrophoneEnabled(false);
    setIsMuted(true);
  }, []);

  // Keep voice alive in background — WebRTC audio runs natively, we just
  // prevent any JS-side auto-disconnect logic from firing.
  useEffect(() => {
    const handleAppState = (_nextState: AppStateStatus) => {
      // Intentionally no-op: do not disconnect when backgrounded.
      // On iOS, UIBackgroundModes audio+voip (in app.config.ts) keeps the
      // process alive. On Android, the native WebRTC module keeps audio running.
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, []);

  // The hook lives in VoiceContext; unmount == deactivate (or switching
  // team <-> guild). Never leave the mic / room connection behind.
  useEffect(() => {
    return () => {
      roomRef.current?.disconnect();
      roomRef.current = null;
      AudioSession.stopAudioSession().catch(() => {});
    };
  }, []);

  const roomCount = isGuild ? participants.length + (status === 'connected' ? 1 : 0) : undefined;
  const canModerate = !!options.canModerate;
  const roomMax = options.max;
  const isListenOnly = roomState.listenOnly;

  // Stable identity until something actually changes: VoiceProvider stores
  // this in state, so a fresh object per render looped forever (app hang).
  return useMemo<VoiceChannelController>(
    () => ({
      status,
      errorMessage,
      participants,
      isMuted,
      isLocalHandRaised,
      isDeafened,
      isPushToTalk,
      join,
      leave,
      toggleMute,
      toggleParticipantMute,
      toggleHandRaise,
      setParticipantVolume,
      kickParticipant,
      toggleDeafen,
      togglePushToTalk,
      pttStart,
      pttStop,
      ...(isGuild
        ? {
            room: voiceRoom,
            canModerate,
            isHostMuted,
            isListenOnly,
            roomCount,
            roomMax,
            muteAll,
            unmuteAll,
            setParticipantHostMuted,
          }
        : { room: voiceRoom }),
    }),
    [
      status,
      errorMessage,
      participants,
      isMuted,
      isLocalHandRaised,
      isDeafened,
      isPushToTalk,
      join,
      leave,
      toggleMute,
      toggleParticipantMute,
      toggleHandRaise,
      setParticipantVolume,
      kickParticipant,
      toggleDeafen,
      togglePushToTalk,
      pttStart,
      pttStop,
      isGuild,
      voiceRoom,
      canModerate,
      isHostMuted,
      isListenOnly,
      roomCount,
      roomMax,
      muteAll,
      unmuteAll,
      setParticipantHostMuted,
    ],
  );
}
