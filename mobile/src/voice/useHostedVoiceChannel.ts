import { useCallback, useRef, useState } from 'react';
import { Room, RoomEvent, RemoteParticipant } from 'livekit-client';
import { VoiceChannelController, VoiceChannelStatus, VoiceParticipant } from './types';

export function useHostedVoiceChannel(
  url: string,
  token: string,
): VoiceChannelController {
  const [status, setStatus] = useState<VoiceChannelStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const localMutesRef = useRef<Set<string>>(new Set());

  const syncParticipants = useCallback((room: Room) => {
    setParticipants(
      [...room.remoteParticipants.values()].map((p: RemoteParticipant) => ({
        id: p.identity,
        name: p.name || p.identity,
        isLocallyMuted: localMutesRef.current.has(p.identity),
      })),
    );
  }, []);

  const applyLocalMute = useCallback((participant: RemoteParticipant, muted: boolean) => {
    // Volume 0 = silent for this client only; they keep talking to everyone else.
    participant.setVolume(muted ? 0 : 1);
  }, []);

  const join = useCallback(async () => {
    setStatus('connecting');
    localMutesRef.current.clear();
    try {
      const room = new Room();
      roomRef.current = room;

      room.on(RoomEvent.ParticipantConnected, () => syncParticipants(room));
      room.on(RoomEvent.ParticipantDisconnected, () => syncParticipants(room));
      room.on(RoomEvent.Disconnected, () => {
        setStatus('idle');
        setParticipants([]);
        setIsMuted(false);
      });

      await room.connect(url, token);
      await room.localParticipant.setMicrophoneEnabled(true);
      syncParticipants(room);
      setIsMuted(false);
      setStatus('connected');
    } catch (err: any) {
      setErrorMessage(err?.message ?? 'Could not join voice channel');
      setStatus('error');
    }
  }, [url, token, syncParticipants]);

  const leave = useCallback(() => {
    roomRef.current?.disconnect();
    roomRef.current = null;
    localMutesRef.current.clear();
    setStatus('idle');
    setParticipants([]);
    setIsMuted(false);
  }, []);

  const toggleMute = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const nextMuted = !isMuted;
    room.localParticipant.setMicrophoneEnabled(!nextMuted);
    setIsMuted(nextMuted);
  }, [isMuted]);

  const toggleParticipantMute = useCallback(
    (participantId: string) => {
      const room = roomRef.current;
      if (!room) return;
      const participant = room.remoteParticipants.get(participantId);
      if (!participant) return;

      const nextMuted = !localMutesRef.current.has(participantId);
      if (nextMuted) localMutesRef.current.add(participantId);
      else localMutesRef.current.delete(participantId);

      applyLocalMute(participant, nextMuted);
      syncParticipants(room);
    },
    [applyLocalMute, syncParticipants],
  );

  return {
    status,
    errorMessage,
    participants,
    isMuted,
    join,
    leave,
    toggleMute,
    toggleParticipantMute,
  };
}
