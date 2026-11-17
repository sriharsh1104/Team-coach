import { io, Socket } from 'socket.io-client';
import { apiBaseUrl } from './client';

// ── Types mirrored from backend/src/games ──────────────────────────────────

export type GameKind = 'rps' | 'ludo';

export const GAME_CATALOG: Array<{
  id: GameKind;
  title: string;
  tagline: string;
  players: string;
  minPlayers: number;
  maxPlayers: number;
  emoji: string;
}> = [
  {
    id: 'rps',
    title: 'Stone Paper Scissors',
    tagline: 'Best of 7 — first to 4 wins',
    players: '2 players',
    minPlayers: 2,
    maxPlayers: 2,
    emoji: '✊',
  },
  {
    id: 'ludo',
    title: 'Ludo',
    tagline: 'Classic board, 4 tokens each',
    players: '2–4 players',
    minPlayers: 2,
    maxPlayers: 4,
    emoji: '🎲',
  },
];

export type RpsChoice = 'stone' | 'paper' | 'scissors';

export interface RpsRoundResult {
  round: number;
  picks: Record<string, RpsChoice>;
  winnerId: string | null;
}

export interface RpsPublicState {
  playerIds: [string, string];
  round: number;
  maxRounds: number;
  winsNeeded: number;
  scores: Record<string, number>;
  picked: Record<string, boolean>;
  phase: 'picking' | 'reveal' | 'done';
  lastResult: RpsRoundResult | null;
  history: RpsRoundResult[];
  winnerId: string | null;
}

export type LudoColor = 'red' | 'green' | 'yellow' | 'blue';

export interface LudoState {
  turnOrder: string[];
  colors: Record<string, LudoColor>;
  tokens: Record<string, number[]>;
  turnIndex: number;
  phase: 'roll' | 'move' | 'done';
  dice: number | null;
  movable: number[];
  sixStreak: number;
  winnerId: string | null;
  ranking: string[];
  lastEvent: string | null;
  version: number;
}

export interface RoomPlayer {
  userId: string;
  name: string;
  avatarUrl: string | null;
  seat: number;
  connected: boolean;
}

export interface RoomView {
  id: string;
  orgId: string;
  game: GameKind;
  title: string;
  hostId: string;
  status: 'lobby' | 'playing' | 'finished';
  players: RoomPlayer[];
  minPlayers: number;
  maxPlayers: number;
  createdAt: number;
  rps: RpsPublicState | null;
  ludo: LudoState | null;
  deadline: number | null;
}

export type RoomEvent = { type: string; payload?: unknown } | null;

export type GamesAck<T> = { ok: true; room: T } | { ok: false; error: string };

export function connectGamesSocket(token: string): Socket {
  return io(`${apiBaseUrl}/games`, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 800,
    reconnectionDelayMax: 5000,
  });
}

/** Promise wrapper over a socket.io ack with a timeout. */
export function gamesEmit<T = RoomView | null>(
  socket: Socket,
  event: string,
  payload?: unknown,
  timeoutMs = 8000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.timeout(timeoutMs).emit(event, payload ?? {}, (err: unknown, ack?: GamesAck<T>) => {
      if (err) {
        reject(new Error('No response from server — check your connection'));
        return;
      }
      if (!ack || ack.ok === false) {
        reject(new Error((ack as { error?: string })?.error || 'Something went wrong'));
        return;
      }
      resolve(ack.room);
    });
  });
}
