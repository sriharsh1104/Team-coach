/**
 * Mute state of a hosted (LiveKit) guild room. Stored in the room's metadata so
 * it survives backend restarts, is visible to every client (they render the
 * "muted" badges from it) and is dropped by LiveKit when the room empties —
 * matching the self-hosted gateway. Enforcement is separate: it is applied as
 * participant permissions, so a modified client still cannot be heard.
 */
export interface HostedRoomState {
  /** "Mute all": everyone but hosts is silent unless individually unmuted. */
  listenOnly: boolean;
  /** Explicitly muted by a host. */
  muted: string[];
  /** Explicitly allowed to speak while listenOnly is on. */
  speakers: string[];
}

/** Hard cap for Team (org roster) voice. */
export const TEAM_VOICE_MAX_PARTICIPANTS = 5;

/** Hard cap for Guild Voice. */
export const GUILD_VOICE_MAX_PARTICIPANTS = 50;

/** Participant attribute set only by our token endpoint (clients cannot write it). */
export const MOD_ATTRIBUTE = 'mod';

export const EMPTY_ROOM_STATE: HostedRoomState = {
  listenOnly: false,
  muted: [],
  speakers: [],
};

export function parseRoomState(metadata: string | undefined | null): HostedRoomState {
  if (!metadata) return { ...EMPTY_ROOM_STATE, muted: [], speakers: [] };
  try {
    const raw = JSON.parse(metadata) as Partial<HostedRoomState>;
    return {
      listenOnly: raw.listenOnly === true,
      muted: Array.isArray(raw.muted) ? raw.muted.filter((x) => typeof x === 'string') : [],
      speakers: Array.isArray(raw.speakers)
        ? raw.speakers.filter((x) => typeof x === 'string')
        : [],
    };
  } catch {
    return { ...EMPTY_ROOM_STATE, muted: [], speakers: [] };
  }
}

/** Whether this (non-host) user must be silenced under the given state. */
export function isUserHostMuted(
  state: HostedRoomState,
  userId: string,
  isHost: boolean,
): boolean {
  if (isHost) return false;
  if (state.muted.includes(userId)) return true;
  return state.listenOnly && !state.speakers.includes(userId);
}

export type ModerationAction = 'muteAll' | 'unmuteAll' | 'mute' | 'unmute';

/** Pure state transition for a moderation action. `targetId` is required for mute/unmute. */
export function applyModeration(
  state: HostedRoomState,
  action: ModerationAction,
  targetId?: string,
): HostedRoomState {
  switch (action) {
    case 'muteAll':
      return { listenOnly: true, muted: [], speakers: [] };
    case 'unmuteAll':
      return { listenOnly: false, muted: [], speakers: [] };
    case 'mute': {
      if (!targetId) throw new Error('Missing target');
      return {
        ...state,
        muted: state.muted.includes(targetId) ? state.muted : [...state.muted, targetId],
        speakers: state.speakers.filter((id) => id !== targetId),
      };
    }
    case 'unmute': {
      if (!targetId) throw new Error('Missing target');
      return {
        ...state,
        muted: state.muted.filter((id) => id !== targetId),
        speakers:
          state.listenOnly && !state.speakers.includes(targetId)
            ? [...state.speakers, targetId]
            : state.speakers,
      };
    }
  }
}
