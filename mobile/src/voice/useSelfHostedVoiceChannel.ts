import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Device, types as mediasoupTypes } from 'mediasoup-client';
import { Socket } from 'socket.io-client';
import { mediaDevices } from '@livekit/react-native-webrtc';
import { AudioSession, AndroidAudioTypePresets } from '@livekit/react-native';
import { connectVoiceSocket, VoiceRoomKind } from '../api/voice';
import { emitToast } from '../ui/toastBus';
import {
  addVoiceNotificationActionListener,
  startVoiceBackground,
  stopVoiceBackground,
} from './voiceBackground';
import { attachVoiceChanger, playHandRaiseCue } from './voiceChanger';
import { playVoiceCue, preloadVoiceCues, unloadVoiceCues } from './voiceCues';
import { VoiceChannelController, VoiceChannelStatus, VoiceParticipant } from './types';
import { voiceRejoinDelayMs } from './voiceReconnect';

function emitAsync<T = any>(socket: Socket, event: string, payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.timeout(8000).emit(event, payload, (err: unknown, response: T) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

type RemoteProducer = {
  producerId: string;
  userId: string;
  userName: string;
  avatarUrl?: string | null;
  handRaised?: boolean;
};
/** Guild voice host-mute state as broadcast by the server. */
type GuildVoiceState = {
  listenOnly: boolean;
  mutedIds: string[];
  moderatorIds: string[];
  /** Everyone currently in the socket room (even before their audio producer lands). */
  members?: Array<{ id: string; name: string; avatarUrl?: string | null }>;
  count: number;
  max: number;
  userId?: string;
  canModerate?: boolean;
};

type ConsumerEntry = { consumer: mediasoupTypes.Consumer; userId: string };

// react-native-webrtc's MediaStreamTrack exposes a per-track playback volume
// (the same hook livekit-react-native uses for RemoteAudioTrack.setVolume).
type VolumeTrack = { _setVolume?: (volume: number) => void };

/**
 * Self-hosted (mediasoup SFU) voice channel. Mounted once in VoiceContext so
 * the session survives navigating away from the Voice screen — the hook
 * itself tears everything down on unmount, which only happens on deactivate.
 */
export function useSelfHostedVoiceChannel(
  authToken: string,
  // mediasoup has no pair room — `direct` is hosted-voice only, and the
  // backend refuses it on this path.
  room: 'team' | 'guild' = 'team',
): VoiceChannelController {
  const [status, setStatus] = useState<VoiceChannelStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isLocalHandRaised, setIsLocalHandRaised] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isPushToTalk, setIsPushToTalk] = useState(false);
  // Guild voice only.
  const [canModerate, setCanModerate] = useState(false);
  const [isHostMuted, setIsHostMuted] = useState(false);
  const [isListenOnly, setIsListenOnly] = useState(false);
  const [roomCount, setRoomCount] = useState<number | undefined>(undefined);
  const [roomMax, setRoomMax] = useState<number | undefined>(undefined);
  const hostMutedIdsRef = useRef<Set<string>>(new Set());
  const moderatorIdsRef = useRef<Set<string>>(new Set());
  const selfIdRef = useRef<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<mediasoupTypes.Transport | null>(null);
  const recvTransportRef = useRef<mediasoupTypes.Transport | null>(null);
  const producerRef = useRef<mediasoupTypes.Producer | null>(null);
  const micStreamRef = useRef<{ getTracks: () => { stop: () => void }[] } | null>(null);
  // consumerId -> consumer + who it belongs to
  const consumersRef = useRef<Map<string, ConsumerEntry>>(new Map());
  // producerId -> who it belongs to
  const producerOwnersRef = useRef<
    Map<string, { id: string; name: string; avatarUrl?: string | null }>
  >(new Map());
  /** Socket-room roster from getVoiceState / voiceState (guild). */
  const roomMembersRef = useRef<
    Map<string, { id: string; name: string; avatarUrl?: string | null }>
  >(new Map());
  // userId -> consumerId
  const userConsumersRef = useRef<Map<string, string>>(new Map());
  // userId -> local playback volume (0–1); unset = 1
  const volumesRef = useRef<Map<string, number>>(new Map());
  const handRaisedIdsRef = useRef<Set<string>>(new Set());
  const speakingIdsRef = useRef<Set<string>>(new Set());

  const isDeafenedRef = useRef(false);
  const isPushToTalkRef = useRef(false);
  const isMutedRef = useRef(false);
  const isHostMutedRef = useRef(false);
  // True between join() start and leave()/fatal error — lets the socket
  // 'disconnect' handler tell an intentional leave from a dropped connection.
  const sessionWantedRef = useRef(false);
  const joiningRef = useRef(false);
  /** Gates join/leave beeps until our own join finished — see the hosted hook. */
  const cuesArmedRef = useRef(false);
  const rejoinAttemptsRef = useRef(0);
  /** Wall-clock start of the current reconnect window (null when stable). */
  const reconnectStartedAtRef = useRef<number | null>(null);
  const rejoinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const joinRef = useRef<() => Promise<void>>(async () => {});

  const refreshParticipants = useCallback(() => {
    const byUser = new Map<string, VoiceParticipant>();
    const self = selfIdRef.current;
    // Socket-room roster first so late joiners see who is already in, even
    // before every remote produce/consume finishes.
    for (const m of roomMembersRef.current.values()) {
      if (self && m.id === self) continue;
      const vol = volumesRef.current.get(m.id) ?? 1;
      byUser.set(m.id, {
        id: m.id,
        name: m.name,
        avatarUrl: m.avatarUrl,
        isLocallyMuted: vol === 0,
        isSpeaking: speakingIdsRef.current.has(m.id),
        isHandRaised: handRaisedIdsRef.current.has(m.id),
        localVolume: vol,
        connectionQuality: 'unknown',
        isHostMuted: hostMutedIdsRef.current.has(m.id),
        isModerator: moderatorIdsRef.current.has(m.id),
      });
    }
    for (const owner of producerOwnersRef.current.values()) {
      if (self && owner.id === self) continue;
      const vol = volumesRef.current.get(owner.id) ?? 1;
      const prev = byUser.get(owner.id);
      byUser.set(owner.id, {
        id: owner.id,
        name: owner.name || prev?.name || 'Member',
        avatarUrl: owner.avatarUrl ?? prev?.avatarUrl,
        isLocallyMuted: vol === 0,
        isSpeaking: speakingIdsRef.current.has(owner.id),
        isHandRaised: handRaisedIdsRef.current.has(owner.id),
        localVolume: vol,
        connectionQuality: 'unknown',
        isHostMuted: hostMutedIdsRef.current.has(owner.id),
        isModerator: moderatorIdsRef.current.has(owner.id),
      });
    }
    setParticipants([...byUser.values()]);
  }, []);

  /** Applies a guild voice-state snapshot (broadcast or from getVoiceState). */
  const applyVoiceState = useCallback(
    (state: GuildVoiceState) => {
      if (state.userId) selfIdRef.current = state.userId;
      hostMutedIdsRef.current = new Set(state.mutedIds ?? []);
      moderatorIdsRef.current = new Set(state.moderatorIds ?? []);
      if (Array.isArray(state.members)) {
        roomMembersRef.current = new Map(
          state.members.map((m) => [
            m.id,
            { id: m.id, name: m.name, avatarUrl: m.avatarUrl ?? null },
          ]),
        );
      }
      setIsListenOnly(!!state.listenOnly);
      setRoomCount(state.count);
      setRoomMax(state.max);
      if (typeof state.canModerate === 'boolean') setCanModerate(state.canModerate);
      const self = selfIdRef.current;
      const muted = !!self && hostMutedIdsRef.current.has(self);
      isHostMutedRef.current = muted;
      setIsHostMuted(muted);
      refreshParticipants();
    },
    [refreshParticipants],
  );

  /** Applies deafen + per-user volume to one consumer's playback. */
  const applyPlayback = useCallback((userId: string) => {
    const consumerId = userConsumersRef.current.get(userId);
    const entry = consumerId ? consumersRef.current.get(consumerId) : undefined;
    if (!entry) return;
    const vol = isDeafenedRef.current ? 0 : (volumesRef.current.get(userId) ?? 1);
    if (vol === 0) {
      if (!entry.consumer.paused) entry.consumer.pause();
      return;
    }
    if (entry.consumer.paused) entry.consumer.resume();
    try {
      (entry.consumer.track as unknown as VolumeTrack)._setVolume?.(vol);
    } catch {
      // Older react-native-webrtc without per-track volume: on/off still works.
    }
  }, []);

  const setMicEnabled = useCallback((enabled: boolean) => {
    const producer = producerRef.current;
    if (producer && !producer.closed) {
      if (enabled) producer.resume();
      else producer.pause();
    }
    isMutedRef.current = !enabled;
    setIsMuted(!enabled);
  }, []);

  const dropConsumerForUser = useCallback((userId: string) => {
    const consumerId = userConsumersRef.current.get(userId);
    if (!consumerId) return;
    consumersRef.current.get(consumerId)?.consumer.close();
    consumersRef.current.delete(consumerId);
    userConsumersRef.current.delete(userId);
  }, []);

  /** Closes every WebRTC object + the mic. Leaves the socket alone. */
  const teardownMedia = useCallback(() => {
    cuesArmedRef.current = false;
    if (rejoinTimerRef.current) {
      clearTimeout(rejoinTimerRef.current);
      rejoinTimerRef.current = null;
    }
    producerRef.current?.close();
    producerRef.current = null;
    try {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      // ignore
    }
    micStreamRef.current = null;
    for (const { consumer } of consumersRef.current.values()) consumer.close();
    consumersRef.current.clear();
    userConsumersRef.current.clear();
    producerOwnersRef.current.clear();
    roomMembersRef.current.clear();
    handRaisedIdsRef.current.clear();
    speakingIdsRef.current.clear();
    sendTransportRef.current?.close();
    recvTransportRef.current?.close();
    sendTransportRef.current = null;
    recvTransportRef.current = null;
    deviceRef.current = null;
    AudioSession.stopAudioSession().catch(() => {});
  }, []);

  const closeSocket = useCallback(() => {
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
    }
  }, []);

  const resetUiState = useCallback(() => {
    setParticipants([]);
    setIsMuted(false);
    setIsLocalHandRaised(false);
    setIsDeafened(false);
    setIsPushToTalk(false);
    isMutedRef.current = false;
    isDeafenedRef.current = false;
    isPushToTalkRef.current = false;
    volumesRef.current.clear();
    hostMutedIdsRef.current = new Set();
    moderatorIdsRef.current = new Set();
    setCanModerate(false);
    isHostMutedRef.current = false;
    setIsHostMuted(false);
    setIsListenOnly(false);
    setRoomCount(undefined);
    setRoomMax(undefined);
  }, []);

  const leave = useCallback(() => {
    sessionWantedRef.current = false;
    rejoinAttemptsRef.current = 0;
    reconnectStartedAtRef.current = null;
    void unloadVoiceCues();
    stopVoiceBackground();
    teardownMedia();
    closeSocket();
    resetUiState();
    setErrorMessage(undefined);
    setStatus('idle');
  }, [teardownMedia, closeSocket, resetUiState]);

  const consumeProducer = useCallback(
    async (
      recvTransport: mediasoupTypes.Transport,
      socket: Socket,
      producerId: string,
      ownerUserId: string,
    ) => {
      const device = deviceRef.current;
      if (!device) return;
      // Keep the working consumer until the replacement is ready — dropping
      // first meant a failed consume left that peer permanently silent.
      const previousConsumerId = userConsumersRef.current.get(ownerUserId);

      const params = await emitAsync<{
        id: string;
        producerId: string;
        kind: 'audio';
        rtpParameters: unknown;
      }>(socket, 'consume', {
        transportId: recvTransport.id,
        producerId,
        rtpCapabilities: device.rtpCapabilities,
      });

      const consumer = await recvTransport.consume({
        id: params.id,
        producerId: params.producerId,
        kind: params.kind,
        rtpParameters: params.rtpParameters as never,
      });

      if (previousConsumerId && previousConsumerId !== consumer.id) {
        const old = consumersRef.current.get(previousConsumerId);
        if (old) {
          try {
            old.consumer.close();
          } catch {
            /* already closed */
          }
          consumersRef.current.delete(previousConsumerId);
        }
      }

      consumersRef.current.set(consumer.id, { consumer, userId: ownerUserId });
      userConsumersRef.current.set(ownerUserId, consumer.id);

      await emitAsync(socket, 'resumeConsumer', { consumerId: consumer.id });
      applyPlayback(ownerUserId);
    },
    [applyPlayback],
  );

  const attachSocketEvents = useCallback(
    (socket: Socket) => {
      socket.on('newProducer', (payload: RemoteProducer) => {
        // One user can produce more than once (a reconnect re-produces), so
        // the beep keys off the roster, not off the producer event.
        const isNewPeer = !roomMembersRef.current.has(payload.userId);
        if (isNewPeer && cuesArmedRef.current && !isDeafenedRef.current) {
          playVoiceCue('join');
        }
        producerOwnersRef.current.set(payload.producerId, {
          id: payload.userId,
          name: payload.userName,
          avatarUrl: payload.avatarUrl,
        });
        roomMembersRef.current.set(payload.userId, {
          id: payload.userId,
          name: payload.userName,
          avatarUrl: payload.avatarUrl,
        });
        refreshParticipants();
        const recvTransport = recvTransportRef.current;
        if (recvTransport) {
          consumeProducer(recvTransport, socket, payload.producerId, payload.userId).catch((err) =>
            console.warn('Failed to consume new producer:', err),
          );
        }
      });

      socket.on('producerClosed', (payload: { producerId: string }) => {
        const owner = producerOwnersRef.current.get(payload.producerId);
        producerOwnersRef.current.delete(payload.producerId);
        if (owner) dropConsumerForUser(owner.id);
        refreshParticipants();
      });

      socket.on('peerLeft', (payload: { userId: string }) => {
        if (cuesArmedRef.current && !isDeafenedRef.current) playVoiceCue('leave');
        for (const [producerId, owner] of producerOwnersRef.current) {
          if (owner.id === payload.userId) producerOwnersRef.current.delete(producerId);
        }
        roomMembersRef.current.delete(payload.userId);
        dropConsumerForUser(payload.userId);
        volumesRef.current.delete(payload.userId);
        handRaisedIdsRef.current.delete(payload.userId);
        speakingIdsRef.current.delete(payload.userId);
        refreshParticipants();

        // Reconnect race fallback: if the peer already re-produced on a new
        // socket, getProducers still lists them — re-consume so we don't stay silent.
        const recvTransport = recvTransportRef.current;
        if (!recvTransport || !sessionWantedRef.current) return;
        emitAsync<RemoteProducer[]>(socket, 'getProducers')
          .then((producers) => {
            if (!sessionWantedRef.current) return;
            let restored = false;
            for (const p of producers) {
              producerOwnersRef.current.set(p.producerId, {
                id: p.userId,
                name: p.userName,
                avatarUrl: p.avatarUrl,
              });
              roomMembersRef.current.set(p.userId, {
                id: p.userId,
                name: p.userName,
                avatarUrl: p.avatarUrl,
              });
              if (p.userId !== payload.userId) continue;
              restored = true;
              consumeProducer(recvTransport, socket, p.producerId, p.userId).catch((err) =>
                console.warn('peerLeft re-consume failed:', err),
              );
            }
            if (restored) refreshParticipants();
          })
          .catch((err) => console.warn('peerLeft getProducers failed:', err));
      });

      socket.on('handRaised', (payload: { userId: string; raised: boolean }) => {
        if (payload.raised) {
          // Beep once when a hand goes up (not on repeats / when deafened).
          if (!handRaisedIdsRef.current.has(payload.userId) && !isDeafenedRef.current) {
            playHandRaiseCue();
          }
          handRaisedIdsRef.current.add(payload.userId);
        } else {
          handRaisedIdsRef.current.delete(payload.userId);
        }
        refreshParticipants();
      });

      socket.on('speaking', (payload: { userIds: string[] }) => {
        speakingIdsRef.current = new Set(payload.userIds ?? []);
        refreshParticipants();
      });

      socket.on('voiceState', (payload: GuildVoiceState) => {
        applyVoiceState(payload);
      });

      socket.on('kicked', (payload: { by?: string }) => {
        sessionWantedRef.current = false;
        stopVoiceBackground();
        teardownMedia();
        closeSocket();
        resetUiState();
        setErrorMessage(
          payload?.by === 'another device'
            ? 'You joined voice from another device, so this one was disconnected.'
            : payload?.by
              ? `You were removed from the voice channel by ${payload.by}.`
              : 'You were removed from the voice channel.',
        );
        setStatus('error');
      });

      socket.on('disconnect', (reason: string) => {
        // Our own leave() → nothing to do. Anything else is a dropped
        // connection: tear down the dead transports and try to get back in
        // for up to 1 minute, then exit so Join works again.
        if (!sessionWantedRef.current) return;
        if (cuesArmedRef.current) playVoiceCue('leave');
        cuesArmedRef.current = false;
        console.warn('Voice socket disconnected:', reason);
        teardownMedia();
        closeSocket();
        if (reconnectStartedAtRef.current === null) {
          reconnectStartedAtRef.current = Date.now();
          emitToast('Network dropped — reconnecting for up to 1 min…');
        }
        const elapsed = Date.now() - (reconnectStartedAtRef.current ?? Date.now());
        rejoinAttemptsRef.current += 1;
        const delay = voiceRejoinDelayMs(rejoinAttemptsRef.current, elapsed);
        if (delay !== null) {
          setStatus('connecting');
          rejoinTimerRef.current = setTimeout(() => {
            rejoinTimerRef.current = null;
            if (sessionWantedRef.current) joinRef.current().catch(() => {});
          }, delay);
        } else {
          sessionWantedRef.current = false;
          reconnectStartedAtRef.current = null;
          rejoinAttemptsRef.current = 0;
          stopVoiceBackground();
          resetUiState();
          setErrorMessage('Could not reconnect in 1 min — tap Join to get back in.');
          setStatus('error');
        }
      });
    },
    [
      consumeProducer,
      dropConsumerForUser,
      refreshParticipants,
      applyVoiceState,
      teardownMedia,
      closeSocket,
      resetUiState,
    ],
  );

  const join = useCallback(async () => {
    if (joiningRef.current) return;
    joiningRef.current = true;
    sessionWantedRef.current = true;
    setErrorMessage(undefined);
    setStatus('connecting');
    try {
      // Route audio like a call (speaker/earpiece/bluetooth handling,
      // VOICE_COMMUNICATION mode on Android) — without this the remote audio
      // can come out of the earpiece at phone-call volume.
      try {
        await AudioSession.configureAudio({
          android: { audioTypeOptions: AndroidAudioTypePresets.communication },
        });
        await AudioSession.startAudioSession();
      } catch (err) {
        console.warn('AudioSession setup failed (continuing):', err);
      }

      // Mic first: a denied permission should fail fast, before we have a
      // socket + server-side transports to clean up. Explicit constraints —
      // without echoCancellation the loudspeaker's own output gets picked
      // back up by the mic and bounces back to everyone else in the room.
      // @livekit/react-native-webrtc's MediaTrackConstraints typing hasn't
      // caught up with these (standard WebRTC) constraints — cast past it.
      const stream = await mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        video: false,
      });
      micStreamRef.current = stream as unknown as typeof micStreamRef.current;
      const track = stream.getAudioTracks()[0] as unknown as MediaStreamTrack;
      // WebRTC's audio pipeline exists now — hook the voice changer in.
      attachVoiceChanger();

      // Android: keep the mic + socket alive when the user switches to their
      // game. Started only after the mic permission is granted.
      startVoiceBackground(
        room === 'guild' ? 'Guild Voice' : 'Team Voice',
        'You are in voice. Tap to return to the voice channel.',
        {
          muted: isMutedRef.current,
          deafened: isDeafenedRef.current,
          room,
        },
      );

      const socket = connectVoiceSocket(authToken, room);
      socketRef.current = socket;
      await new Promise<void>((resolve, reject) => {
        const onConnect = () => {
          cleanup();
          resolve();
        };
        const onError = (err: unknown) => {
          cleanup();
          reject(err instanceof Error ? err : new Error(String((err as any)?.message ?? err)));
        };
        const cleanup = () => {
          socket.off('connect', onConnect);
          socket.off('connect_error', onError);
        };
        socket.once('connect', onConnect);
        socket.once('connect_error', onError);
      });
      attachSocketEvents(socket);

      const routerRtpCapabilities = await emitAsync(socket, 'getRtpCapabilities');
      const device = new Device({ handlerName: 'ReactNative106' });
      await device.load({ routerRtpCapabilities: routerRtpCapabilities as never });
      deviceRef.current = device;

      const sendParams = await emitAsync<mediasoupTypes.TransportOptions>(socket, 'createTransport');
      const sendTransport = device.createSendTransport(sendParams);
      sendTransportRef.current = sendTransport;
      sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        emitAsync(socket, 'connectTransport', { transportId: sendTransport.id, dtlsParameters })
          .then(() => callback())
          .catch(errback);
      });
      sendTransport.on('produce', ({ kind, rtpParameters }, callback, errback) => {
        emitAsync<{ id: string }>(socket, 'produce', { transportId: sendTransport.id, kind, rtpParameters })
          .then((res) => callback({ id: res.id }))
          .catch(errback);
      });

      const recvParams = await emitAsync<mediasoupTypes.TransportOptions>(socket, 'createTransport');
      const recvTransport = device.createRecvTransport(recvParams);
      recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        emitAsync(socket, 'connectTransport', { transportId: recvTransport.id, dtlsParameters })
          .then(() => callback())
          .catch(errback);
      });
      recvTransportRef.current = recvTransport;

      const producer = await sendTransport.produce({ track });
      producerRef.current = producer;
      // Carry mute / PTT across a reconnect (deafen does not pause the mic).
      if (isMutedRef.current || isPushToTalkRef.current) {
        producer.pause();
      }

      const existingProducers = await emitAsync<RemoteProducer[]>(socket, 'getProducers');
      for (const p of existingProducers) {
        producerOwnersRef.current.set(p.producerId, {
          id: p.userId,
          name: p.userName,
          avatarUrl: p.avatarUrl,
        });
        roomMembersRef.current.set(p.userId, {
          id: p.userId,
          name: p.userName,
          avatarUrl: p.avatarUrl,
        });
        if (p.handRaised) handRaisedIdsRef.current.add(p.userId);
      }
      // Guild: pull the socket roster so we list people who are already in
      // even if their producer handshake is still catching up.
      if (room === 'guild') {
        try {
          applyVoiceState(await emitAsync<GuildVoiceState>(socket, 'getVoiceState'));
        } catch (err) {
          console.warn('getVoiceState failed:', err);
        }
      }
      refreshParticipants();
      for (const p of existingProducers) {
        try {
          await consumeProducer(recvTransport, socket, p.producerId, p.userId);
        } catch (err) {
          console.warn('Failed to consume existing producer:', err);
        }
      }

      if (isLocalHandRaised) {
        emitAsync(socket, 'setHandRaised', { raised: true }).catch(() => {});
      }

      const wasReconnecting = reconnectStartedAtRef.current !== null;
      rejoinAttemptsRef.current = 0;
      reconnectStartedAtRef.current = null;
      setStatus('connected');
      preloadVoiceCues();
      cuesArmedRef.current = true;
      if (wasReconnecting) emitToast('Back in the voice call');
    } catch (err: any) {
      // Never leave half a session behind: close whatever got created so
      // "Try Again" starts clean and the mic LED goes off.
      // Still inside the 1 min reconnect window → schedule another attempt.
      const reconnectStarted = reconnectStartedAtRef.current;
      const retryDelay =
        reconnectStarted !== null && sessionWantedRef.current
          ? voiceRejoinDelayMs(
              rejoinAttemptsRef.current + 1,
              Date.now() - reconnectStarted,
            )
          : null;
      stopVoiceBackground();
      teardownMedia();
      closeSocket();
      if (retryDelay !== null) {
        rejoinAttemptsRef.current += 1;
        setStatus('connecting');
        rejoinTimerRef.current = setTimeout(() => {
          rejoinTimerRef.current = null;
          if (sessionWantedRef.current) joinRef.current().catch(() => {});
        }, retryDelay);
        return;
      }
      sessionWantedRef.current = false;
      reconnectStartedAtRef.current = null;
      rejoinAttemptsRef.current = 0;
      setErrorMessage(
        reconnectStarted !== null
          ? 'Could not reconnect in 1 min — tap Join to get back in.'
          : (err?.message ?? 'Could not join voice channel'),
      );
      setStatus('error');
    } finally {
      joiningRef.current = false;
    }
  }, [authToken, room, attachSocketEvents, consumeProducer, refreshParticipants, applyVoiceState, teardownMedia, closeSocket, isLocalHandRaised]);
  joinRef.current = join;

  // The hook lives in VoiceContext; unmount == deactivate. Make sure the mic
  // and the socket never outlive it.
  useEffect(() => {
    return () => {
      sessionWantedRef.current = false;
      stopVoiceBackground();
      teardownMedia();
      closeSocket();
    };
  }, [teardownMedia, closeSocket]);

  const toggleMute = useCallback(() => {
    if (isPushToTalkRef.current) return;
    if (isHostMutedRef.current) {
      emitToast('A host muted you. Raise your hand to ask for the mic.');
      return;
    }
    setMicEnabled(isMutedRef.current);
  }, [setMicEnabled]);

  const setParticipantVolume = useCallback(
    (participantId: string, volume: number) => {
      const clamped = Math.max(0, Math.min(1, volume));
      volumesRef.current.set(participantId, clamped);
      applyPlayback(participantId);
      refreshParticipants();
    },
    [applyPlayback, refreshParticipants],
  );

  const toggleParticipantMute = useCallback(
    (participantId: string) => {
      const current = volumesRef.current.get(participantId) ?? 1;
      setParticipantVolume(participantId, current === 0 ? 1 : 0);
    },
    [setParticipantVolume],
  );

  const toggleHandRaise = useCallback(() => {
    setIsLocalHandRaised((prev) => {
      const next = !prev;
      const socket = socketRef.current;
      if (socket?.connected) {
        emitAsync(socket, 'setHandRaised', { raised: next }).catch((err) =>
          console.warn('setHandRaised failed:', err),
        );
      }
      return next;
    });
  }, []);

  const kickParticipant = useCallback((participantId: string) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    emitAsync(socket, 'kick', { userId: participantId }).catch((err) =>
      console.warn('kick failed:', err),
    );
  }, []);

  const toggleDeafen = useCallback(() => {
    const next = !isDeafenedRef.current;
    isDeafenedRef.current = next;
    setIsDeafened(next);
    // Deafen only silences incoming audio — mic stays under mute / PTT control.
    for (const userId of userConsumersRef.current.keys()) applyPlayback(userId);
  }, [applyPlayback]);

  const togglePushToTalk = useCallback(() => {
    const next = !isPushToTalkRef.current;
    isPushToTalkRef.current = next;
    setIsPushToTalk(next);
    if (next) {
      setMicEnabled(false);
    } else {
      setMicEnabled(true);
    }
  }, [setMicEnabled]);

  const pttStart = useCallback(() => {
    if (!isPushToTalkRef.current) return;
    setMicEnabled(true);
  }, [setMicEnabled]);

  const pttStop = useCallback(() => {
    if (!isPushToTalkRef.current) return;
    setMicEnabled(false);
  }, [setMicEnabled]);

  // Keep the ongoing-call notification's Mute/Deafen labels in sync with
  // actual state, including the early call inside join() before the first
  // render with status === 'connecting' lands.
  useEffect(() => {
    if (status !== 'connected' && status !== 'connecting') return;
    startVoiceBackground(
      room === 'guild' ? 'Guild Voice' : 'Team Voice',
      'You are in voice. Tap to return to the voice channel.',
      { muted: isMuted, deafened: isDeafened, room },
    );
  }, [status, isMuted, isDeafened, room]);

  // Mute / Deafen / Leave tapped on the notification itself (app backgrounded).
  useEffect(() => {
    return addVoiceNotificationActionListener((action) => {
      if (action === 'mute') toggleMute();
      else if (action === 'deafen') toggleDeafen();
      else if (action === 'leave') leave();
    });
  }, [toggleMute, toggleDeafen, leave]);

  const hostAction = useCallback((event: string, payload?: unknown) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    emitAsync(socket, event, payload).catch((err) => {
      console.warn(`${event} failed:`, err);
      emitToast(err instanceof Error && err.message ? err.message : 'Could not do that. Try again.');
    });
  }, []);

  const muteAll = useCallback(() => hostAction('muteAll'), [hostAction]);
  const unmuteAll = useCallback(() => hostAction('unmuteAll'), [hostAction]);
  const setParticipantHostMuted = useCallback(
    (id: string, muted: boolean) => hostAction('muteUser', { userId: id, muted }),
    [hostAction],
  );

  // Stable identity until something actually changes: VoiceProvider stores
  // this in state, so a fresh object per render looped forever (app hang).
  const toggleScreenShare = useCallback(() => {
    emitToast('Screen share needs hosted voice. Ask your coach to enable it.');
  }, []);

  const startMusicShare = useCallback((_pick: { title: string; mime: string; uri: string }) => {
    emitToast('Music share needs hosted voice. Ask your coach to enable it.');
  }, []);

  const stopMusicShare = useCallback(() => {}, []);

  return useMemo<VoiceChannelController>(
    () => ({
      status,
      errorMessage,
      participants,
      isMuted,
      isLocalHandRaised,
      isDeafened,
      isPushToTalk,
      isScreenSharing: false,
      screenShare: null,
      musicShare: null,
      join,
      leave,
      toggleMute,
      toggleScreenShare,
      startMusicShare,
      stopMusicShare,
      toggleParticipantMute,
      toggleHandRaise,
      setParticipantVolume,
      kickParticipant,
      toggleDeafen,
      togglePushToTalk,
      pttStart,
      pttStop,
      ...(room === 'guild'
        ? {
            room,
            canModerate,
            isHostMuted,
            isListenOnly,
            roomCount,
            roomMax,
            muteAll,
            unmuteAll,
            setParticipantHostMuted,
          }
        : { room }),
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
      toggleScreenShare,
      startMusicShare,
      stopMusicShare,
      toggleParticipantMute,
      toggleHandRaise,
      setParticipantVolume,
      kickParticipant,
      toggleDeafen,
      togglePushToTalk,
      pttStart,
      pttStop,
      room,
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
