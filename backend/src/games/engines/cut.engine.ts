/**
 * Cut — a 2–4 player race to clear your own board.
 *
 * Every player holds the same nine numbers, 1 through 9. On your turn you
 * draw from the shared card: a number you have not cut yet gets cut and you
 * draw again, so a hot streak keeps the card in your hands. The moment the
 * card shows a number you have already cut, your turn ends and it passes on.
 * First player to cut all nine wins.
 *
 * Everything here is public — there are no hidden hands, so every player and
 * spectator sees exactly the same state.
 */

export const CUT_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export const CUT_TARGET = CUT_NUMBERS.length;
export const CUT_MIN_PLAYERS = 2;
export const CUT_MAX_PLAYERS = 4;

export type CutPhase = 'play' | 'done';

export type CutState = {
  playerIds: string[];
  /** Per player, which numbers they have already cut (ascending). */
  cut: Record<string, number[]>;
  turnIndex: number;
  phase: CutPhase;
  /** The number showing on the shared card, or null before the first draw. */
  lastDraw: number | null;
  lastDrawBy: string | null;
  /** True when that draw was already cut — i.e. it ended the drawer's turn. */
  lastWasRepeat: boolean;
  winnerId: string | null;
  lastEvent: string | null;
  version: number;
};

/** Same shape for everyone: this game hides nothing. */
export type CutPublicState = CutState & { turnId: string };

export function currentCutPlayer(state: CutState): string {
  return state.playerIds[state.turnIndex];
}

export function createCutState(playerIds: string[]): CutState {
  if (playerIds.length < CUT_MIN_PLAYERS || playerIds.length > CUT_MAX_PLAYERS) {
    throw new Error(`Cut needs ${CUT_MIN_PLAYERS}–${CUT_MAX_PLAYERS} players`);
  }
  const cut: Record<string, number[]> = {};
  for (const id of playerIds) cut[id] = [];
  return {
    playerIds: [...playerIds],
    cut,
    turnIndex: 0,
    phase: 'play',
    lastDraw: null,
    lastDrawBy: null,
    lastWasRepeat: false,
    winnerId: null,
    lastEvent: 'Draw a number to start cutting',
    version: 1,
  };
}

/** Numbers this player still has to cut — what the UI greys out as it goes. */
export function remainingFor(state: CutState, userId: string): number[] {
  const done = new Set(state.cut[userId] ?? []);
  return CUT_NUMBERS.filter((n) => !done.has(n));
}

function advanceTurn(state: CutState) {
  const n = state.playerIds.length;
  if (n === 0) return;
  state.turnIndex = (state.turnIndex + 1) % n;
}

/**
 * Draw the shared card for the player whose turn it is.
 *
 * Returns the number drawn and whether it ended the turn, so the caller can
 * narrate it without re-deriving anything from the state.
 */
export function cutDraw(
  state: CutState,
  userId: string,
  rng: () => number = Math.random,
): { number: number; repeat: boolean } {
  if (state.phase !== 'play') throw new Error('Game is over');
  if (currentCutPlayer(state) !== userId) throw new Error('Not your turn');

  const drawn = CUT_NUMBERS[Math.floor(rng() * CUT_NUMBERS.length)];
  const mine = state.cut[userId] ?? (state.cut[userId] = []);
  const repeat = mine.includes(drawn);

  state.lastDraw = drawn;
  state.lastDrawBy = userId;
  state.lastWasRepeat = repeat;
  state.version++;

  if (repeat) {
    // Already cut — the card passes on, which is the only way a turn ends.
    state.lastEvent = `${drawn} was already cut — turn passes`;
    advanceTurn(state);
    return { number: drawn, repeat: true };
  }

  mine.push(drawn);
  mine.sort((a, b) => a - b);

  if (mine.length === CUT_TARGET) {
    state.phase = 'done';
    state.winnerId = userId;
    state.lastEvent = 'Board cleared — wins the game!';
    return { number: drawn, repeat: false };
  }

  state.lastEvent = `Cut ${drawn} — draw again`;
  return { number: drawn, repeat: false };
}

export function cutForfeit(state: CutState, userId: string): void {
  if (state.phase === 'done') return;
  const idx = state.playerIds.indexOf(userId);
  if (idx < 0) return;

  const wasTheirTurn = state.turnIndex === idx;
  state.playerIds.splice(idx, 1);
  delete state.cut[userId];

  if (state.playerIds.length <= 1) {
    state.phase = 'done';
    state.winnerId = state.playerIds[0] ?? null;
    state.lastEvent = 'Opponent left — you win';
    state.version++;
    return;
  }

  // Keep pointing at the same seat: removing an earlier player shifts
  // everyone after them down one, and a player who leaves on their own turn
  // hands it to whoever now occupies their index.
  if (idx < state.turnIndex) state.turnIndex -= 1;
  if (wasTheirTurn) state.turnIndex = state.turnIndex % state.playerIds.length;
  state.turnIndex = state.turnIndex % state.playerIds.length;
  state.lastEvent = 'A player left the game';
  state.version++;
}

export function cutPublicState(state: CutState): CutPublicState {
  return {
    ...state,
    playerIds: [...state.playerIds],
    cut: Object.fromEntries(
      Object.entries(state.cut).map(([id, nums]) => [id, [...nums]]),
    ),
    turnId: currentCutPlayer(state),
  };
}
