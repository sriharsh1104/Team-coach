import { io, Socket } from 'socket.io-client';
import { apiClient, apiBaseUrl } from './client';
import { VoiceConfig, VoiceOccupancy } from './types';

export type VoiceRoomKind = 'team' | 'guild';

/** `room` picks the team room (default) or the guild-wide room. */
export function getVoiceConfig(room: VoiceRoomKind = 'team') {
  return apiClient
    .get<VoiceConfig>('/voice/config', room === 'guild' ? { params: { room } } : undefined)
    .then((res) => res.data);
}

/** Who is already in the voice channel — does not join the caller. */
export function getVoiceOccupancy(room: VoiceRoomKind = 'team') {
  return apiClient
    .get<VoiceOccupancy>(
      '/voice/occupancy',
      room === 'guild' ? { params: { room } } : undefined,
    )
    .then((res) => res.data);
}

export type VoiceModerateAction = 'muteAll' | 'unmuteAll' | 'mute' | 'unmute' | 'kick';

/**
 * Hosted-voice moderation. The server re-checks that the caller is a host and
 * enforces the result on the LiveKit room, so this is a request, not a command
 * the client can fake.
 */
export function moderateVoice(room: VoiceRoomKind, action: VoiceModerateAction, userId?: string) {
  return apiClient
    .post('/voice/moderate', { room, action, ...(userId ? { userId } : {}) })
    .then((res) => res.data);
}

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

