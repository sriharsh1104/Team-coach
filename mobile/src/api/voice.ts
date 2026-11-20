import { io, Socket } from 'socket.io-client';
import { apiClient, apiBaseUrl } from './client';
import { VoiceConfig } from './types';

export function getVoiceConfig() {
  return apiClient.get<VoiceConfig>('/voice/config').then((res) => res.data);
}

export type VoiceRoomKind = 'team' | 'guild';

export function connectVoiceSocket(token: string, room: VoiceRoomKind = 'team'): Socket {
  return io(`${apiBaseUrl}/voice`, {
    auth: room === 'guild' ? { token, room } : { token },
    transports: ['websocket'],
    // No socket.io auto-reconnect: mediasoup transports don't survive a
    // dropped socket, so useSelfHostedVoiceChannel rebuilds the whole
    // session itself on 'disconnect' instead.
    reconnection: false,
  });
}

