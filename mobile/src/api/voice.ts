import { io, Socket } from 'socket.io-client';
import { apiClient, apiBaseUrl } from './client';
import { VoiceConfig } from './types';

export function getVoiceConfig() {
  return apiClient.get<VoiceConfig>('/voice/config').then((res) => res.data);
}

export function connectVoiceSocket(token: string): Socket {
  return io(`${apiBaseUrl}/voice`, {
    auth: { token },
    transports: ['websocket'],
  });
}

