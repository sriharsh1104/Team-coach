import { useCallback, useRef, useState } from 'react';
import { Device, types as mediasoupTypes } from 'mediasoup-client';
import { Socket } from 'socket.io-client';
import { mediaDevices } from '@livekit/react-native-webrtc';
import { connectVoiceSocket } from '../api/voice';
import { VoiceChannelController, VoiceChannelStatus, VoiceParticipant } from './types';

function emitAsync<T = any>(socket: Socket, event: string, payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.timeout(8000).emit(event, payload, (err: unknown, response: T) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

export function useSelfHostedVoiceChannel(authToken: string): VoiceChannelController {
  const [status, setStatus] = useState<VoiceChannelStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [isMuted, setIsMuted] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const producerRef = useRef<mediasoupTypes.Producer | null>(null);
  const recvTransportRef = useRef<mediasoupTypes.Transport | null>(null);
  const consumersRef = useRef<Map<string, mediasoupTypes.Consumer>>(new Map());
  // producerId -> who it belongs to, so a later 'producerClosed'/'peerLeft' can remove them from the list.
  const producerOwnersRef = useRef<Map<string, VoiceParticipant>>(new Map());

  const refreshParticipants = useCallback(() => {
    setParticipants([...producerOwnersRef.current.values()]);
  }, []);

  const consumeProducer = useCallback(
    async (recvTransport: mediasoupTypes.Transport, socket: Socket, producerId: string) => {
      const device = deviceRef.current;
      if (!device) return;

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
      consumersRef.current.set(consumer.id, consumer);

      await emitAsync(socket, 'resumeConsumer', { consumerId: consumer.id });
      // Remote audio tracks play automatically once part of an active
      // RTCPeerConnection — no <RTCView> needed for audio-only.
    },
    [],
  );

  const join = useCallback(async () => {
    setStatus('connecting');
    try {
      const socket = connectVoiceSocket(authToken);
      socketRef.current = socket;

      await new Promise<void>((resolve, reject) => {
        socket.on('connect', () => resolve());
        socket.on('connect_error', (err) => reject(err));
        socket.on('error', (err) => reject(new Error(err?.message ?? 'Voice connection rejected')));
      });

      socket.on('newProducer', (payload: { producerId: string; userId: string; userName: string }) => {
        producerOwnersRef.current.set(payload.producerId, {
          id: payload.userId,
          name: payload.userName,
        });
        refreshParticipants();
        const recvTransport = recvTransportRef.current;
        if (recvTransport) {
          consumeProducer(recvTransport, socket, payload.producerId).catch((err) =>
            console.warn('Failed to consume new producer:', err),
          );
        }
      });

      socket.on('producerClosed', (payload: { producerId: string }) => {
        producerOwnersRef.current.delete(payload.producerId);
        refreshParticipants();
      });

      socket.on('peerLeft', (payload: { userId: string }) => {
        for (const [producerId, owner] of producerOwnersRef.current) {
          if (owner.id === payload.userId) {
            producerOwnersRef.current.delete(producerId);
          }
        }
        refreshParticipants();
      });

      const routerRtpCapabilities = await emitAsync(socket, 'getRtpCapabilities');
      const device = new Device({ handlerName: 'ReactNative106' });
      await device.load({ routerRtpCapabilities: routerRtpCapabilities as never });
      deviceRef.current = device;

      // Send transport — for our own microphone.
      const sendParams = await emitAsync<mediasoupTypes.TransportOptions>(
        socket,
        'createTransport',
      );
      const sendTransport = device.createSendTransport(sendParams);
      sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        emitAsync(socket, 'connectTransport', {
          transportId: sendTransport.id,
          dtlsParameters,
        })
          .then(() => callback())
          .catch(errback);
      });
      sendTransport.on('produce', ({ kind, rtpParameters }, callback, errback) => {
        emitAsync<{ id: string }>(socket, 'produce', {
          transportId: sendTransport.id,
          kind,
          rtpParameters,
        })
          .then((res) => callback({ id: res.id }))
          .catch(errback);
      });

      // Recv transport — for everyone else's audio.
      const recvParams = await emitAsync<mediasoupTypes.TransportOptions>(
        socket,
        'createTransport',
      );
      const recvTransport = device.createRecvTransport(recvParams);
      recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        emitAsync(socket, 'connectTransport', {
          transportId: recvTransport.id,
          dtlsParameters,
        })
          .then(() => callback())
          .catch(errback);
      });
      recvTransportRef.current = recvTransport;

      const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      // @livekit/react-native-webrtc's MediaStreamTrack doesn't structurally
      // match TS's DOM lib type (e.g. missing `contentHint`) — it's the same
      // object mediasoup-client expects at runtime, so this cast is safe.
      const track = stream.getAudioTracks()[0] as unknown as MediaStreamTrack;
      const producer = await sendTransport.produce({ track });
      producerRef.current = producer;

      const existingProducers = await emitAsync<
        { producerId: string; userId: string; userName: string }[]
      >(socket, 'getProducers');
      for (const p of existingProducers) {
        producerOwnersRef.current.set(p.producerId, { id: p.userId, name: p.userName });
      }
      refreshParticipants();
      for (const p of existingProducers) {
        await consumeProducer(recvTransport, socket, p.producerId);
      }

      setStatus('connected');
    } catch (err: any) {
      setErrorMessage(err?.message ?? 'Could not join voice channel');
      setStatus('error');
    }
  }, [authToken, consumeProducer, refreshParticipants]);

  const leave = useCallback(() => {
    producerRef.current?.close();
    for (const consumer of consumersRef.current.values()) consumer.close();
    consumersRef.current.clear();
    producerOwnersRef.current.clear();
    recvTransportRef.current = null;
    socketRef.current?.disconnect();
    socketRef.current = null;
    setParticipants([]);
    setStatus('idle');
  }, []);

  const toggleMute = useCallback(() => {
    const producer = producerRef.current;
    if (!producer) return;
    if (producer.paused) {
      producer.resume();
      setIsMuted(false);
    } else {
      producer.pause();
      setIsMuted(true);
    }
  }, []);

  return { status, errorMessage, participants, isMuted, join, leave, toggleMute };
}
