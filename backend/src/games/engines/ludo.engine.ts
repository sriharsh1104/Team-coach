/**
 * Ludo — pure game logic, no I/O. 2–4 players, 4 tokens each.
 *
 * Token position = steps travelled from that player's start square:
 *   -1        in base (needs a 1 or 6 to come out)
 *   0..50     on the shared 52-square track (absolute square = start + s)
 *   51..56    the player's private home column
 *   57        home (finished)
 *
 * Rules: 1 or 6 to leave base; a 6 (or a capture, or reaching home) grants an
 * extra turn; three 6s in a row forfeit the turn; landing on an opponent on
 * a non-safe square sends it back to base; exact roll needed to reach 57.
 * First player with all four tokens home wins the game.
 */
export type LudoColor = 'red' | 'green' | 'yellow' | 'blue';

export const LUDO_COLORS: readonly LudoColor[] = ['red', 'green', 'yellow', 'blue'];
export const LUDO_TRACK_LEN = 52;
export const LUDO_HOME_STEP = 57;
/** Absolute track index where each colour enters and starts counting. */
export const LUDO_START: Record<LudoColor, number> = { red: 0, green: 13, yellow: 26, blue: 39 };
/** Start squares + star squares: tokens here can't be captured. */
export const LUDO_SAFE_SQUARES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

export interface LudoState {
  /** Seat order == turn order. */
  turnOrder: string[];
  colors: Record<string, LudoColor>;
  tokens: Record<string, number[]>;
  turnIndex: number;
  phase: 'roll' | 'move' | 'done';
  /** Last roll (null before the current player rolls). */
  dice: number | null;
  /** Token indexes the current player may move with `dice`. */
  movable: number[];
  sixStreak: number;
  winnerId: string | null;
  /** Finishing order so far (winner first). */
  ranking: string[];
  /** Short human-readable description of what just happened (for the UI). */
  lastEvent: string | null;
  /** Monotonic counter so clients can animate only genuinely new moves. */
  version: number;
}

export function createLudoState(playerIds: string[]): LudoState {
  if (playerIds.length < 2 || playerIds.length > 4) {
    throw new Error('Ludo needs 2 to 4 players');
  }
  // 2 players sit opposite each other (red vs yellow) so the board feels balanced.
  const seatColors: LudoColor[] =
    playerIds.length === 2 ? ['red', 'yellow'] : LUDO_COLORS.slice(0, playerIds.length);
  const colors: Record<string, LudoColor> = {};
  const tokens: Record<string, number[]> = {};
  playerIds.forEach((id, i) => {
    colors[id] = seatColors[i];
    tokens[id] = [-1, -1, -1, -1];
  });
  return {
    turnOrder: [...playerIds],
    colors,
    tokens,
    turnIndex: 0,
    phase: 'roll',
    dice: null,
    movable: [],
    sixStreak: 0,
    winnerId: null,
    ranking: [],
    lastEvent: null,
    version: 0,
  };
}

export function currentPlayer(state: LudoState): string {
  return state.turnOrder[state.turnIndex];
}

/** Absolute track square for a token on the track, or null in base / home column / home. */
export function absoluteSquare(color: LudoColor, step: number): number | null {
  if (step < 0 || step > 50) return null;
  return (LUDO_START[color] + step) % LUDO_TRACK_LEN;
}

/** House rule: a 1 or a 6 brings a token out of base. */
export function canLeaveBase(dice: number): boolean {
  return dice === 1 || dice === 6;
}

export function movableTokens(state: LudoState, userId: string, dice: number): number[] {
  const out: number[] = [];
  state.tokens[userId].forEach((step, i) => {
    if (step === LUDO_HOME_STEP) return;
    if (step === -1) {
      if (canLeaveBase(dice)) out.push(i);
      return;
    }
    if (step + dice <= LUDO_HOME_STEP) out.push(i);
  });
  return out;
}

export function rollDice(rng: () => number = Math.random): number {
  return 1 + Math.floor(rng() * 6);
}

/**
 * Current player rolls. Returns the dice value. If nothing can move (or the
 * third consecutive 6), the turn passes automatically.
 */
export function ludoRoll(state: LudoState, userId: string, dice: number): number {
  if (state.phase !== 'roll') throw new Error('Not time to roll');
  if (currentPlayer(state) !== userId) throw new Error('Not your turn');
  if (dice < 1 || dice > 6) throw new Error('Invalid dice');

  state.dice = dice;
  state.version += 1;
  if (dice === 6) {
    state.sixStreak += 1;
    if (state.sixStreak >= 3) {
      state.lastEvent = 'Three sixes in a row — turn lost';
      advanceTurn(state);
      return dice;
    }
  } else {
    state.sixStreak = 0;
  }

  const movable = movableTokens(state, userId, dice);
  if (movable.length === 0) {
    state.lastEvent = `Rolled ${dice} — no move`;
    advanceTurn(state);
    return dice;
  }
  state.movable = movable;
  state.phase = 'move';
  state.lastEvent = `Rolled ${dice}`;
  return dice;
}

export interface LudoMoveResult {
  captured: Array<{ userId: string; tokenIndex: number }>;
  reachedHome: boolean;
  extraTurn: boolean;
}

export function ludoMove(state: LudoState, userId: string, tokenIndex: number): LudoMoveResult {
  if (state.phase !== 'move') throw new Error('Roll first');
  if (currentPlayer(state) !== userId) throw new Error('Not your turn');
  if (!state.movable.includes(tokenIndex)) throw new Error('That token cannot move');
  const dice = state.dice!;
  const color = state.colors[userId];
  const tokens = state.tokens[userId];
  const from = tokens[tokenIndex];
  const to = from === -1 ? 0 : from + dice;
  tokens[tokenIndex] = to;
  state.version += 1;

  const result: LudoMoveResult = { captured: [], reachedHome: false, extraTurn: false };

  const square = absoluteSquare(color, to);
  if (square !== null && !LUDO_SAFE_SQUARES.has(square)) {
    for (const otherId of state.turnOrder) {
      if (otherId === userId) continue;
      const otherColor = state.colors[otherId];
      state.tokens[otherId].forEach((step, i) => {
        if (absoluteSquare(otherColor, step) === square) {
          state.tokens[otherId][i] = -1;
          result.captured.push({ userId: otherId, tokenIndex: i });
        }
      });
    }
  }
  if (to === LUDO_HOME_STEP) result.reachedHome = true;

  if (tokens.every((t) => t === LUDO_HOME_STEP)) {
    state.ranking.push(userId);
    state.winnerId = state.ranking[0];
    state.phase = 'done';
    state.movable = [];
    state.lastEvent = 'All four tokens home!';
    return result;
  }

  result.extraTurn = dice === 6 || result.captured.length > 0 || result.reachedHome;
  state.lastEvent = result.captured.length
    ? `Captured ${result.captured.length} token${result.captured.length > 1 ? 's' : ''}!`
    : result.reachedHome
      ? 'Token reached home'
      : dice === 6
        ? 'Rolled a 6 — roll again'
        : null;

  state.movable = [];
  // Keep `dice` so the board still shows the number that was just played;
  // the next `ludoRoll` overwrites it.
  if (result.extraTurn) {
    state.phase = 'roll';
  } else {
    advanceTurn(state);
  }
  return result;
}

function advanceTurn(state: LudoState): void {
  state.turnIndex = (state.turnIndex + 1) % state.turnOrder.length;
  state.phase = 'roll';
  // Leave `dice` set — UI needs to show what was rolled when nothing could move.
  state.movable = [];
  state.sixStreak = 0;
}

/** A player leaves mid-game: their tokens are removed and the turn skips them. */
export function ludoRemovePlayer(state: LudoState, userId: string): void {
  const idx = state.turnOrder.indexOf(userId);
  if (idx < 0 || state.phase === 'done') return;
  const wasCurrent = idx === state.turnIndex;
  state.turnOrder.splice(idx, 1);
  delete state.tokens[userId];
  delete state.colors[userId];
  state.version += 1;
  if (state.turnOrder.length === 1) {
    state.winnerId = state.turnOrder[0];
    state.ranking = [state.turnOrder[0]];
    state.phase = 'done';
    state.movable = [];
    state.lastEvent = 'Opponent left — you win';
    return;
  }
  if (idx < state.turnIndex) state.turnIndex -= 1;
  if (wasCurrent) {
    state.turnIndex = state.turnIndex % state.turnOrder.length;
    state.phase = 'roll';
    state.movable = [];
    state.sixStreak = 0;
  }
}

/** Steps-based progress (0..228) — used for ranking players who did not finish. */
export function ludoProgress(state: LudoState, userId: string): number {
  return (state.tokens[userId] ?? []).reduce((sum, s) => sum + Math.max(0, s + 1), 0);
}
