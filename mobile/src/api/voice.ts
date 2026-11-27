import { io, Socket } from 'socket.io-client';
import { apiClient, apiBaseUrl } from './client';
import { VoiceConfig, VoiceOccupancy } from './types';

export type VoiceRoomKind = 'team' | 'guild' | 'direct';

/**
 * `room` picks the team room (default), the guild-wide room, or a 1-on-1
 * call — the last needs `peerId`, and the server only mints a token when
 * BOTH people hold the admin-granted permission.
 */
/**
 * Tells the API that Join was tapped (or finished / failed). The LiveKit
 * connection itself never hits our server, so this is how the click shows
 * up in backend logs. Failures are ignored — logging must not block the call.
 */
export function logVoiceJoin(
  room: VoiceRoomKind,
  phase: 'click' | 'connected' | 'error',
  detail?: string,
) {
  return apiClient
    .post('/voice/join-log', {
      room,
      phase,
      ...(detail ? { detail: detail.slice(0, 180) } : {}),
    })
    .then(() => undefined)
    .catch(() => undefined);
}

export function getVoiceConfig(room: VoiceRoomKind = 'team', peerId?: string) {
  const params =
    room === 'direct'
      ? { room, peer: peerId }
      : room === 'guild'
        ? { room }
        : undefined;
  return apiClient
    .get<VoiceConfig>('/voice/config', params ? { params } : undefined)
    .then((res) => res.data);
}

export type DirectVoicePeer = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

/**
 * Who the signed-in user can place a 1-on-1 call to — other holders of the
 * permission inside their own guild.
 *
 * `enabled: false` means they do not hold the permission (hide the section).
 * `needsGuild: true` means they hold it but are in no guild yet, so there is
 * nobody they could call until they join one.
 */
export function getDirectVoicePeers() {
  return apiClient
    .get<{
      enabled: boolean;
      needsGuild: boolean;
      peers: DirectVoicePeer[];
    }>('/voice/direct/peers')
    .then((res) => res.data);
}

/** Who is already in the voice channel — does not join the caller. */
export function getVoiceOccupancy(
  room: VoiceRoomKind = 'team',
  peerId?: string,
) {
  const params =
    room === 'direct'
      ? { room, peer: peerId }
      : room === 'guild'
        ? { room }
        : undefined;
  return apiClient
    .get<VoiceOccupancy>('/voice/occupancy', params ? { params } : undefined)
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

export type VoiceInviteResult = {
  /** Teammates a push actually went out to. */
  sent: number;
  /** Named but skipped — not in the org, or already pinged recently. */
  skipped: number;
};

/**
 * "Ping to join": nudge teammates that you are waiting in team voice. The
 * server re-checks that the caller is really in the room, that the targets
 * share the org, and rate-limits repeats — so this cannot be used to spam.
 */
export function inviteToVoice(userIds: string[]) {
  return apiClient
    .post<VoiceInviteResult>('/voice/invite', { userIds })
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

