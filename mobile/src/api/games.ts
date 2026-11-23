import { io, Socket } from 'socket.io-client';
import { apiBaseUrl } from './client';

// ── Types mirrored from backend/src/games ──────────────────────────────────

export type GameKind = 'rps' | 'ludo' | 'boots';

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
    tagline: 'Best of 3 — first to 2 wins',
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
  {
    id: 'boots',
    title: 'Boots',
    tagline: '6×6 fleet hunt — place boots, then fire',
    players: '2 players',
    minPlayers: 2,
    maxPlayers: 2,
    emoji: '🚢',
  },
];

export const BOOTS_COLS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export const BOOTS_ROWS = [1, 2, 3, 4, 5, 6] as const;
export const BOOTS_DEFAULT_FLEET = [5, 3, 2];

export type BootsOrientation = 'horizontal' | 'vertical';
export type BootsShotResult = 'miss' | 'hit' | 'sunk';
export type BootsCell = { col: number; row: number };
export type BootsBoot = {
  id: string;
  length: number;
  cells: BootsCell[];
  sunk: boolean;
};

export type BootsPublicState = {
  playerIds: [string, string];
  fleet: number[];
  phase: 'placing' | 'battle' | 'done';
  turnId: string | null;
  lastShot: {
    by: string;
    cell: BootsCell;
    result: BootsShotResult;
    bootLength?: number;
  } | null;
  winnerId: string | null;
  ready: Record<string, boolean>;
  own: { boots: BootsBoot[]; shots: Record<string, BootsShotResult> };
  enemy: { shots: Record<string, BootsShotResult>; sunkBoots: BootsBoot[] };
  sunkCounts: Record<string, number>;
};

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
  boots: BootsPublicState | null;
  bootsFleet: number[] | null;
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
