import { io, Socket } from 'socket.io-client';
import { apiBaseUrl } from './client';

// ── Types mirrored from backend/src/games ──────────────────────────────────

export type GameKind =
  | 'rps'
  | 'ludo'
  | 'boots'
  | 'cut'
  | 'chess'
  | 'uno'
  | 'race';

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
    id: 'cut',
    title: 'Cut',
    tagline: 'Cut 1–9 off your board — a repeat ends your turn',
    players: '2–4 players',
    minPlayers: 2,
    maxPlayers: 4,
    emoji: '🔢',
  },
  {
    id: 'chess',
    title: 'Chess',
    tagline: 'Full rules — castling, en passant, promotion',
    players: '2 players',
    minPlayers: 2,
    maxPlayers: 2,
    emoji: '♞',
  },
  {
    id: 'uno',
    title: 'UNO',
    tagline: 'Match colour or number — shout UNO on your last card',
    players: '2–4 players',
    minPlayers: 2,
    maxPlayers: 4,
    emoji: '🃏',
  },
  {
    id: 'race',
    title: 'Road Rash Rush',
    tagline: 'Four lanes, real time — kick rivals off their bikes',
    players: '1–4 players',
    minPlayers: 1,
    maxPlayers: 4,
    emoji: '🏍️',
  },
  {
    id: 'boots',
    title: 'Boots',
    tagline: '6×6 fleet hunt — place boots, then fire',
    players: '2–4 players',
    minPlayers: 2,
    maxPlayers: 4,
    emoji: '🚢',
  },
];

/* ---------------- Road Rash Rush ---------------- */

export type RaceAttack = 'punch' | 'kick';
/** What a rider's pad can send. */
export type RaceAction = 'left' | 'right' | 'nitro' | RaceAttack;

export type RaceEvent =
  | { type: 'swing'; seat: number; move: RaceAttack }
  | { type: 'hit'; seat: number; target: number; move: RaceAttack }
  | { type: 'wipeout'; seat: number }
  | { type: 'crash'; seat: number }
  | { type: 'nitro'; seat: number }
  | { type: 'finish'; seat: number };

/**
 * The grid, which only changes between races. The race itself arrives on the
 * separate `race:tick` channel — a room view twenty times a second would be
 * orders of magnitude more traffic than this game needs.
 */
export type RacePublicState = {
  seed: number;
  finishDist: number;
  phase: 'play' | 'done';
  winnerId: string | null;
  winnerSeat: number | null;
  endReason: 'finish' | 'forfeit' | null;
  seats: {
    seat: number;
    userId: string | null;
    name: string;
    tag: string;
    color: string;
    helmet: string;
  }[];
};

/**
 * One frame of the world, 20 times a second. Bare arrays on purpose.
 * `b` rows are [lane, dist, hp, nitro, speed, flags]; `c` and `p` are
 * [lane, dist]. Flags: 1 boosting, 2 down, 4 kicking, 8 punching.
 */
export type RaceTick = {
  t: number;
  b: number[][];
  c: number[][];
  p: number[][];
  ev: RaceEvent[];
  done: 0 | 1;
};

export const RACE_FLAG_BOOST = 1;
export const RACE_FLAG_DOWN = 2;
export const RACE_FLAG_KICK = 4;
export const RACE_FLAG_PUNCH = 8;

/* ---------------- UNO ---------------- */

export const UNO_COLORS = ['red', 'blue', 'green', 'yellow'] as const;
export type UnoColor = (typeof UNO_COLORS)[number];

export type UnoValue =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'skip'
  | 'reverse'
  | 'draw2'
  | 'wild'
  | 'wild4';

/** `color` is null on a wild that has not been played yet. */
export type UnoCard = { id: string; color: UnoColor | null; value: UnoValue };

export type UnoEndReason = 'empty-hand' | 'forfeit';

/** Viewer-scoped: your own cards in full, everyone else's as a count. */
export type UnoPublicState = {
  playerIds: string[];
  hand: UnoCard[];
  counts: Record<string, number>;
  topCard: UnoCard | null;
  activeColor: UnoColor;
  turnIndex: number;
  turnId: string;
  /** 1 = down the seat order, -1 = back up it. */
  direction: 1 | -1;
  drawPileCount: number;
  discardCount: number;
  phase: 'play' | 'done';
  /** Card ids in `hand` that are legal right now — server-decided. */
  playable: string[];
  /** You have taken your card this turn: play it or pass. */
  youDrew: boolean;
  drawnCardId: string | null;
  calledUno: Record<string, boolean>;
  winnerId: string | null;
  endReason: UnoEndReason | null;
  lastEvent: string | null;
  version: number;
};

/** Short face label — what is printed big in the middle of the card. */
export function unoLabel(card: UnoCard): string {
  switch (card.value) {
    case 'draw2':
      return '+2';
    case 'skip':
      return '⊘';
    case 'reverse':
      return '⇄';
    case 'wild':
      return 'W';
    case 'wild4':
      return '+4';
    default:
      return card.value;
  }
}

/* ---------------- Chess ---------------- */

export type ChessColor = 'w' | 'b';
export type ChessPieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type ChessPromotion = 'q' | 'r' | 'b' | 'n';
export type ChessPiece = { type: ChessPieceType; color: ChessColor };

export type ChessMove = {
  from: string;
  to: string;
  promotion?: ChessPromotion;
};

export type ChessMoveRecord = ChessMove & {
  piece: ChessPieceType;
  color: ChessColor;
  captured?: ChessPieceType;
  castle?: 'king' | 'queen';
  enPassant?: boolean;
  check?: boolean;
  checkmate?: boolean;
  san: string;
};

export type ChessEndReason =
  | 'checkmate'
  | 'stalemate'
  | 'fifty-move'
  | 'threefold'
  | 'insufficient-material'
  | 'forfeit';

export type ChessPublicState = {
  playerIds: [string, string];
  /** 64 squares, index 0 = a8 through index 63 = h1. */
  board: (ChessPiece | null)[];
  turn: ChessColor;
  yourColor: ChessColor | null;
  /** Server-generated; the board never has to work out legality itself. */
  legalMoves: ChessMove[];
  inCheck: boolean;
  phase: 'play' | 'done';
  winnerId: string | null;
  endReason: ChessEndReason | null;
  lastMove: ChessMoveRecord | null;
  history: ChessMoveRecord[];
  halfmoveClock: number;
  fullmove: number;
  captured: { w: ChessPieceType[]; b: ChessPieceType[] };
};

export const CHESS_FILES = 'abcdefgh';

/** Mid-game taunts. Closed set — the server rejects anything else. */
export const GAME_REACTIONS = ['angry', 'loser', 'laughing', 'cool'] as const;
export type GameReaction = (typeof GAME_REACTIONS)[number];

export function chessIndexToSquare(index: number): string {
  return `${CHESS_FILES[index % 8]}${8 - Math.floor(index / 8)}`;
}

export function chessSquareToIndex(square: string): number {
  return (8 - Number(square[1])) * 8 + CHESS_FILES.indexOf(square[0]);
}

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

/** One opponent's board as this viewer may see it. */
export type BootsEnemyView = {
  id: string;
  shots: Record<string, BootsShotResult>;
  sunkBoots: BootsBoot[];
  sunkCount: number;
  fleetSize: number;
  eliminated: boolean;
  ready: boolean;
};

export type BootsPublicState = {
  playerIds: string[];
  fleet: number[];
  phase: 'placing' | 'battle' | 'done';
  turnId: string | null;
  lastShot: {
    by: string;
    /** Who was fired at — always set on a live 3-4 player match. */
    target?: string;
    cell: BootsCell;
    result: BootsShotResult;
    bootLength?: number;
  } | null;
  winnerId: string | null;
  ready: Record<string, boolean>;
  eliminated: Record<string, boolean>;
  own: { boots: BootsBoot[]; shots: Record<string, BootsShotResult>; sunkCount: number };
  /** Every other seat, in seat order. */
  enemies: BootsEnemyView[];
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

/** Every player cuts these same nine numbers off their own board. */
export const CUT_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export type CutPublicState = {
  playerIds: string[];
  /** Per player, the numbers they have already cut (ascending). */
  cut: Record<string, number[]>;
  turnIndex: number;
  turnId: string;
  phase: 'play' | 'done';
  /** The number showing on the shared card, null before the first draw. */
  lastDraw: number | null;
  lastDrawBy: string | null;
  /** True when that draw was already cut — i.e. it ended the drawer's turn. */
  lastWasRepeat: boolean;
  winnerId: string | null;
  lastEvent: string | null;
  version: number;
};

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

export interface RoomSpectator {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

export interface RoomView {
  id: string;
  orgId: string;
  game: GameKind;
  title: string;
  hostId: string;
  status: 'lobby' | 'playing' | 'finished';
  players: RoomPlayer[];
  /** Non-players watching a live match (Chess / Ludo only). */
  spectators: RoomSpectator[];
  /** Whether this game can be watched at all. */
  spectatable: boolean;
  minPlayers: number;
  maxPlayers: number;
  createdAt: number;
  rps: RpsPublicState | null;
  ludo: LudoState | null;
  boots: BootsPublicState | null;
  cut: CutPublicState | null;
  chess: ChessPublicState | null;
  uno: UnoPublicState | null;
  race: RacePublicState | null;
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
