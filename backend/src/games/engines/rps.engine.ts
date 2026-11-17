/**
 * Stone · Paper · Scissors — pure game logic, no I/O.
 *
 * Best-of-7 between two players: the first to 4 round wins takes the match.
 * A drawn round is replayed and does not count towards the 7.
 */
export type RpsChoice = 'stone' | 'paper' | 'scissors';

export const RPS_CHOICES: readonly RpsChoice[] = ['stone', 'paper', 'scissors'];
export const RPS_MAX_ROUNDS = 7;
export const RPS_WINS_NEEDED = 4;

export interface RpsRoundResult {
  round: number;
  picks: Record<string, RpsChoice>;
  /** null = draw (round replayed). */
  winnerId: string | null;
}

export interface RpsState {
  playerIds: [string, string];
  /** 1-based number of the round currently being played. */
  round: number;
  maxRounds: number;
  winsNeeded: number;
  scores: Record<string, number>;
  /** Hidden picks for the round in progress. */
  picks: Record<string, RpsChoice | null>;
  phase: 'picking' | 'reveal' | 'done';
  lastResult: RpsRoundResult | null;
  history: RpsRoundResult[];
  winnerId: string | null;
}

/** What clients see — the opponent's pick stays hidden until the reveal. */
export interface RpsPublicState {
  playerIds: [string, string];
  round: number;
  maxRounds: number;
  winsNeeded: number;
  scores: Record<string, number>;
  picked: Record<string, boolean>;
  phase: RpsState['phase'];
  lastResult: RpsRoundResult | null;
  history: RpsRoundResult[];
  winnerId: string | null;
}

export function createRpsState(playerIds: [string, string]): RpsState {
  return {
    playerIds,
    round: 1,
    maxRounds: RPS_MAX_ROUNDS,
    winsNeeded: RPS_WINS_NEEDED,
    scores: { [playerIds[0]]: 0, [playerIds[1]]: 0 },
    picks: { [playerIds[0]]: null, [playerIds[1]]: null },
    phase: 'picking',
    lastResult: null,
    history: [],
    winnerId: null,
  };
}

export function beats(a: RpsChoice, b: RpsChoice): boolean {
  return (
    (a === 'stone' && b === 'scissors') ||
    (a === 'paper' && b === 'stone') ||
    (a === 'scissors' && b === 'paper')
  );
}

export function isRpsChoice(value: unknown): value is RpsChoice {
  return typeof value === 'string' && (RPS_CHOICES as string[]).includes(value);
}

/**
 * Records a pick. Returns whether the round is now complete (both picked),
 * in which case the state has moved to 'reveal' (or 'done').
 */
export function rpsPick(state: RpsState, userId: string, choice: RpsChoice): boolean {
  if (state.phase !== 'picking') throw new Error('Not accepting picks right now');
  if (!(userId in state.picks)) throw new Error('Not a player in this match');
  if (state.picks[userId]) throw new Error('You already picked this round');
  state.picks[userId] = choice;

  const [a, b] = state.playerIds;
  const pa = state.picks[a];
  const pb = state.picks[b];
  if (!pa || !pb) return false;

  const winnerId = beats(pa, pb) ? a : beats(pb, pa) ? b : null;
  const result: RpsRoundResult = {
    round: state.round,
    picks: { [a]: pa, [b]: pb },
    winnerId,
  };
  state.lastResult = result;
  state.history.push(result);
  if (winnerId) state.scores[winnerId] += 1;
  state.phase = 'reveal';

  const matchWinner = matchWinnerOf(state);
  if (matchWinner) {
    state.winnerId = matchWinner;
    state.phase = 'done';
  }
  return true;
}

/** After the reveal pause: clear picks and advance (unless the match is over). */
export function rpsNextRound(state: RpsState): void {
  if (state.phase !== 'reveal') return;
  const decisive = state.lastResult?.winnerId != null;
  if (decisive) state.round += 1;
  for (const id of state.playerIds) state.picks[id] = null;
  state.phase = 'picking';
}

function matchWinnerOf(state: RpsState): string | null {
  const [a, b] = state.playerIds;
  if (state.scores[a] >= state.winsNeeded) return a;
  if (state.scores[b] >= state.winsNeeded) return b;
  // All 7 decisive rounds played without reaching 4 can't happen (4+3), but
  // guard anyway: whoever leads after the last round wins.
  if (state.round >= state.maxRounds && state.lastResult?.winnerId) {
    if (state.scores[a] !== state.scores[b]) {
      return state.scores[a] > state.scores[b] ? a : b;
    }
  }
  return null;
}

/** Player forfeits (left / disconnected too long): the other wins immediately. */
export function rpsForfeit(state: RpsState, userId: string): void {
  if (state.phase === 'done') return;
  const other = state.playerIds.find((id) => id !== userId);
  if (!other) return;
  state.winnerId = other;
  state.phase = 'done';
}

export function rpsPublicState(state: RpsState): RpsPublicState {
  const picked: Record<string, boolean> = {};
  for (const id of state.playerIds) picked[id] = !!state.picks[id];
  return {
    playerIds: state.playerIds,
    round: state.round,
    maxRounds: state.maxRounds,
    winsNeeded: state.winsNeeded,
    scores: { ...state.scores },
    picked,
    phase: state.phase,
    lastResult: state.lastResult,
    history: state.history,
    winnerId: state.winnerId,
  };
}
