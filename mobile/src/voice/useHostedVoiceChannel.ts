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

  const syncParticipants = useCallback((room: Room) => {
    setParticipants(
      [...room.remoteParticipants.values()].map((p: RemoteParticipant) => ({
        id: p.identity,
        name: p.name || p.identity,
      })),
    );
  }, []);

  const join = useCallback(async () => {
    setStatus('connecting');
    try {
      const room = new Room();
      roomRef.current = room;

      room.on(RoomEvent.ParticipantConnected, () => syncParticipants(room));
      room.on(RoomEvent.ParticipantDisconnected, () => syncParticipants(room));
      room.on(RoomEvent.Disconnected, () => {
        setStatus('idle');
        setParticipants([]);
      });

      await room.connect(url, token);
      await room.localParticipant.setMicrophoneEnabled(true);
      syncParticipants(room);
      setStatus('connected');
    } catch (err: any) {
      setErrorMessage(err?.message ?? 'Could not join voice channel');
      setStatus('error');
    }
  }, [url, token, syncParticipants]);

  const leave = useCallback(() => {
    roomRef.current?.disconnect();
    roomRef.current = null;
    setStatus('idle');
    setParticipants([]);
  }, []);

  const toggleMute = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const nextMuted = !isMuted;
    room.localParticipant.setMicrophoneEnabled(!nextMuted);
    setIsMuted(nextMuted);
  }, [isMuted]);

  return { status, errorMessage, participants, isMuted, join, leave, toggleMute };
}
