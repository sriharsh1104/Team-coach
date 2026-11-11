import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  Room,
  RoomEvent,
  RemoteParticipant,
  Participant,
  ConnectionQuality,
} from 'livekit-client';
import {
  VoiceChannelController,
  VoiceChannelStatus,
  VoiceParticipant,
  ConnectionQualityLevel,
} from './types';

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

type DataMsg =
  | { type: 'hand_raise'; raised: boolean }
  | { type: 'kick' };

export function useHostedVoiceChannel(
  url: string,
  token: string,
): VoiceChannelController {
  const [status, setStatus] = useState<VoiceChannelStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isLocalHandRaised, setIsLocalHandRaised] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isPushToTalk, setIsPushToTalk] = useState(false);

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
        };
      }),
    );
  }, []);

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
  }, []);

  const join = useCallback(async () => {
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
      room.on(RoomEvent.Disconnected, () => {
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
            } else if (msg.type === 'kick') {
              // We were kicked — leave immediately
              leave();
            }
          } catch {
            // Ignore malformed data messages
          }
        },
      );

      await room.connect(url, token);
      await room.localParticipant.setMicrophoneEnabled(true);
      syncParticipants(room);
      setIsMuted(false);
      setStatus('connected');
    } catch (err: any) {
      setErrorMessage(err?.message ?? 'Could not join voice channel');
      setStatus('error');
    }
  }, [url, token, syncParticipants, leave]);

  const toggleMute = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    // Don't toggle mic when deafened; deafen controls mic in that case
    if (isDeafenedRef.current) return;
    // Don't toggle mic in PTT mode; pttStart/pttStop control it
    if (isPushToTalkRef.current) return;
    setIsMuted((prev) => {
      const nextMuted = !prev;
      room.localParticipant.setMicrophoneEnabled(!nextMuted);
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

  const kickParticipant = useCallback(
    (participantId: string) => {
      publishData({ type: 'kick' }, [participantId]);
    },
    [publishData],
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
        if (!isPushToTalkRef.current) {
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
        if (!isDeafenedRef.current) {
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

  return {
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
  };
}
