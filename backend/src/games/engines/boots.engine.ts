/**
 * Boots — Battleship-style 2–4 player fleet hunt on a 6×6 board (A–F × 1–6).
 *
 * Each player places boots of configurable lengths (e.g. 5 + 3 + 2),
 * horizontal or vertical. Then they take turns firing — in a 3-4 player
 * match, choosing which still-alive opponent's board to hit. Turn order is
 * round-robin over seats (skipping eliminated players), independent of who
 * you fired at — in a 2-player match that is identical to "alternate with
 * the other player," which is why the old behaviour falls out of this for
 * free. Sink a fleet completely and its owner is eliminated; last fleet
 * afloat wins.
 */

export const BOOTS_COLS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export const BOOTS_ROWS = [1, 2, 3, 4, 5, 6] as const;
export const BOOTS_SIZE = 6;
/** Default fleet matching the sketch: length-5, length-3, length-2. */
export const BOOTS_DEFAULT_FLEET = [5, 3, 2] as const;
export const BOOTS_MIN_PLAYERS = 2;
export const BOOTS_MAX_PLAYERS = 4;

export type BootsOrientation = 'horizontal' | 'vertical';

export type BootsCell = {
  col: number; // 0..5 → A..F
  row: number; // 0..5 → 1..6
};

export type Boot = {
  id: string;
  length: number;
  cells: BootsCell[];
  sunk: boolean;
};

export type ShotResult = 'miss' | 'hit' | 'sunk';

export type BootsPhase = 'placing' | 'battle' | 'done';

export type BootsPlayerBoard = {
  boots: Boot[];
  /** Cells that have been fired at on this board (by anyone). */
  shots: Record<string, ShotResult>;
  ready: boolean;
};

export type BootsState = {
  playerIds: string[];
  fleet: number[];
  boards: Record<string, BootsPlayerBoard>;
  phase: BootsPhase;
  /** Whose turn it is to fire (battle only). */
  turnId: string | null;
  /** Fleet fully sunk, or forfeited — out of the match either way. */
  eliminated: Record<string, boolean>;
  lastShot: {
    by: string;
    /** Who was fired at — omitted from old 2-player saves, never from new ones. */
    target?: string;
    cell: BootsCell;
    result: ShotResult;
    bootLength?: number;
  } | null;
  winnerId: string | null;
};

/** One opponent's board as a viewer may see it. */
export type BootsEnemyView = {
  id: string;
  /** Only revealed shot results (no boot shapes until sunk). */
  shots: Record<string, ShotResult>;
  /** Sunk boots are revealed in full so the finder sees the completed shape. */
  sunkBoots: Boot[];
  sunkCount: number;
  fleetSize: number;
  eliminated: boolean;
  ready: boolean;
};

/** What one client may see — opponents' unhit cells stay hidden. */
export type BootsPublicState = {
  playerIds: string[];
  fleet: number[];
  phase: BootsPhase;
  turnId: string | null;
  lastShot: BootsState['lastShot'];
  winnerId: string | null;
  ready: Record<string, boolean>;
  eliminated: Record<string, boolean>;
  /** Own board: full boots + shots received + how much of it is destroyed. */
  own: {
    boots: Boot[];
    shots: Record<string, ShotResult>;
    sunkCount: number;
  };
  /** Every other seat, in seat order. */
  enemies: BootsEnemyView[];
};

export function cellKey(c: BootsCell): string {
  return `${c.col},${c.row}`;
}

export function parseCoord(raw: string): BootsCell | null {
  const m = String(raw)
    .trim()
    .toUpperCase()
    .match(/^([A-F])\s*([1-6])$/);
  if (!m) return null;
  return {
    col: BOOTS_COLS.indexOf(m[1] as (typeof BOOTS_COLS)[number]),
    row: Number(m[2]) - 1,
  };
}

export function formatCoord(c: BootsCell): string {
  return `${BOOTS_COLS[c.col]}${c.row + 1}`;
}

export function normalizeFleet(raw: unknown): number[] {
  const list = Array.isArray(raw) ? raw : [...BOOTS_DEFAULT_FLEET];
  const sizes = list
    .map((n) => Math.trunc(Number(n)))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= BOOTS_SIZE);
  if (sizes.length === 0) return [...BOOTS_DEFAULT_FLEET];
  // Cap total cells so the board can actually hold them with gaps.
  const maxCells = Math.floor((BOOTS_SIZE * BOOTS_SIZE) * 0.55);
  const out: number[] = [];
  let used = 0;
  for (const n of sizes.slice(0, 6)) {
    if (used + n > maxCells) break;
    out.push(n);
    used += n;
  }
  return out.length > 0 ? out.sort((a, b) => b - a) : [...BOOTS_DEFAULT_FLEET];
}

export function createBootsState(
  playerIds: string[],
  fleet: number[] = [...BOOTS_DEFAULT_FLEET],
): BootsState {
  if (playerIds.length < BOOTS_MIN_PLAYERS || playerIds.length > BOOTS_MAX_PLAYERS) {
    throw new Error(`Boots needs ${BOOTS_MIN_PLAYERS}–${BOOTS_MAX_PLAYERS} players`);
  }
  const sizes = normalizeFleet(fleet);
  const boards: Record<string, BootsPlayerBoard> = {};
  const eliminated: Record<string, boolean> = {};
  for (const id of playerIds) {
    boards[id] = { boots: [], shots: {}, ready: false };
    eliminated[id] = false;
  }
  return {
    playerIds: [...playerIds],
    fleet: sizes,
    boards,
    phase: 'placing',
    turnId: null,
    eliminated,
    lastShot: null,
    winnerId: null,
  };
}

function inBounds(c: BootsCell): boolean {
  return (
    c.col >= 0 &&
    c.col < BOOTS_SIZE &&
    c.row >= 0 &&
    c.row < BOOTS_SIZE
  );
}

function occupiedKeys(boots: Boot[]): Set<string> {
  const set = new Set<string>();
  for (const b of boots) for (const c of b.cells) set.add(cellKey(c));
  return set;
}

/** Everyone still in the match, in seat order. */
function aliveIds(state: BootsState): string[] {
  return state.playerIds.filter((id) => !state.eliminated[id]);
}

/** The next surviving seat after `afterId`, wrapping around. Falls back to
 * `afterId` itself only if nobody else survives (win should already have
 * fired by then). */
function nextAliveTurn(state: BootsState, afterId: string): string {
  const ids = state.playerIds;
  const n = ids.length;
  const idx = ids.indexOf(afterId);
  for (let i = 1; i <= n; i++) {
    const candidate = ids[(idx + i) % n];
    if (!state.eliminated[candidate]) return candidate;
  }
  return afterId;
}

/** Cells a boot of `length` would cover from `start` in `orientation`. */
export function bootCells(
  start: BootsCell,
  length: number,
  orientation: BootsOrientation,
): BootsCell[] | null {
  const cells: BootsCell[] = [];
  for (let i = 0; i < length; i++) {
    const c: BootsCell =
      orientation === 'horizontal'
        ? { col: start.col + i, row: start.row }
        : { col: start.col, row: start.row + i };
    if (!inBounds(c)) return null;
    cells.push(c);
  }
  return cells;
}

export function canPlaceBoot(
  board: BootsPlayerBoard,
  start: BootsCell,
  length: number,
  orientation: BootsOrientation,
): boolean {
  const cells = bootCells(start, length, orientation);
  if (!cells) return false;
  const taken = occupiedKeys(board.boots);
  return cells.every((c) => !taken.has(cellKey(c)));
}

/**
 * Place the next boot in fleet order (by remaining lengths).
 * Returns the placed boot id.
 */
export function placeBoot(
  state: BootsState,
  userId: string,
  start: BootsCell,
  orientation: BootsOrientation,
): string {
  if (state.phase !== 'placing') throw new Error('Placement is over');
  const board = state.boards[userId];
  if (!board) throw new Error('Not a player in this match');
  if (board.ready) throw new Error('You already locked your fleet');

  const remaining = remainingLengths(board, state.fleet);
  if (remaining.length === 0) throw new Error('All boots are placed');
  const length = remaining[0];
  if (!canPlaceBoot(board, start, length, orientation)) {
    throw new Error('That spot does not fit this boot');
  }
  const cells = bootCells(start, length, orientation)!;
  const id = `b${board.boots.length + 1}-${length}`;
  board.boots.push({ id, length, cells, sunk: false });
  return id;
}

export function remainingLengths(
  board: BootsPlayerBoard,
  fleet: number[],
): number[] {
  const used = [...board.boots.map((b) => b.length)].sort((a, b) => b - a);
  const need = [...fleet].sort((a, b) => b - a);
  const left: number[] = [];
  for (const n of need) {
    const i = used.indexOf(n);
    if (i >= 0) used.splice(i, 1);
    else left.push(n);
  }
  return left;
}

export function clearBoots(state: BootsState, userId: string): void {
  if (state.phase !== 'placing') throw new Error('Placement is over');
  const board = state.boards[userId];
  if (!board) throw new Error('Not a player in this match');
  if (board.ready) throw new Error('You already locked your fleet');
  board.boots = [];
}

/** Random legal placement for every remaining boot. */
export function placeBootsRandom(
  state: BootsState,
  userId: string,
  rng: () => number = Math.random,
): void {
  if (state.phase !== 'placing') throw new Error('Placement is over');
  const board = state.boards[userId];
  if (!board) throw new Error('Not a player in this match');
  if (board.ready) throw new Error('You already locked your fleet');

  board.boots = [];
  const lengths = [...state.fleet].sort((a, b) => b - a);
  for (const length of lengths) {
    const options: { start: BootsCell; orientation: BootsOrientation }[] = [];
    for (let row = 0; row < BOOTS_SIZE; row++) {
      for (let col = 0; col < BOOTS_SIZE; col++) {
        for (const orientation of ['horizontal', 'vertical'] as const) {
          if (canPlaceBoot(board, { col, row }, length, orientation)) {
            options.push({ start: { col, row }, orientation });
          }
        }
      }
    }
    if (options.length === 0) {
      board.boots = [];
      throw new Error('Could not place fleet — try again');
    }
    const pick = options[Math.floor(rng() * options.length)];
    const cells = bootCells(pick.start, length, pick.orientation)!;
    board.boots.push({
      id: `b${board.boots.length + 1}-${length}`,
      length,
      cells,
      sunk: false,
    });
  }
}

export function markReady(state: BootsState, userId: string): void {
  if (state.phase !== 'placing') throw new Error('Placement is over');
  const board = state.boards[userId];
  if (!board) throw new Error('Not a player in this match');
  const left = remainingLengths(board, state.fleet);
  if (left.length > 0) throw new Error('Place every boot first');
  board.ready = true;

  if (aliveIds(state).every((id) => state.boards[id].ready)) {
    state.phase = 'battle';
    // First seater shoots first.
    state.turnId = state.playerIds[0];
  }
}

export function fire(
  state: BootsState,
  userId: string,
  target: BootsCell,
  targetId?: string,
): ShotResult {
  if (state.phase !== 'battle') throw new Error('Not in battle yet');
  if (state.turnId !== userId) throw new Error('Not your turn');
  if (!inBounds(target)) throw new Error('Off the board');

  const liveOpponents = state.playerIds.filter(
    (id) => id !== userId && !state.eliminated[id],
  );
  let enemyId = targetId;
  if (!enemyId) {
    if (liveOpponents.length !== 1) {
      throw new Error('Choose who to fire at');
    }
    enemyId = liveOpponents[0];
  } else if (!liveOpponents.includes(enemyId)) {
    throw new Error('That player is not a live target');
  }

  const enemy = state.boards[enemyId];
  const key = cellKey(target);
  if (enemy.shots[key]) throw new Error('Already fired there');

  const boot = enemy.boots.find((bt) =>
    bt.cells.some((c) => c.col === target.col && c.row === target.row),
  );
  let result: ShotResult = 'miss';
  let bootLength: number | undefined;
  if (boot) {
    enemy.shots[key] = 'hit';
    const allHit = boot.cells.every((c) => {
      const s = enemy.shots[cellKey(c)];
      return s === 'hit' || s === 'sunk';
    });
    if (allHit) {
      result = 'sunk';
      boot.sunk = true;
      bootLength = boot.length;
      for (const c of boot.cells) enemy.shots[cellKey(c)] = 'sunk';
    } else {
      result = 'hit';
    }
  } else {
    enemy.shots[key] = 'miss';
  }

  state.lastShot = { by: userId, target: enemyId, cell: target, result, bootLength };

  if (enemy.boots.every((bt) => bt.sunk)) {
    state.eliminated[enemyId] = true;
  }

  const survivors = aliveIds(state);
  if (survivors.length <= 1) {
    state.phase = 'done';
    state.winnerId = survivors[0] ?? userId;
    state.turnId = null;
  } else {
    state.turnId = nextAliveTurn(state, userId);
  }
  return result;
}

export function bootsForfeit(state: BootsState, userId: string): void {
  if (state.phase === 'done') return;
  if (!state.playerIds.includes(userId) || state.eliminated[userId]) return;
  const wasTurn = state.turnId === userId;
  state.eliminated[userId] = true;

  const survivors = aliveIds(state);
  if (survivors.length <= 1) {
    state.phase = 'done';
    state.winnerId = survivors[0] ?? null;
    state.turnId = null;
    return;
  }
  if (wasTurn) state.turnId = nextAliveTurn(state, userId);
}

export function bootsPublicState(
  state: BootsState,
  viewerId: string,
): BootsPublicState {
  const own = state.boards[viewerId] ?? state.boards[state.playerIds[0]];
  const ownId = state.boards[viewerId] ? viewerId : state.playerIds[0];

  const ready: Record<string, boolean> = {};
  for (const id of state.playerIds) ready[id] = state.boards[id].ready;

  const enemies: BootsEnemyView[] = state.playerIds
    .filter((id) => id !== ownId)
    .map((id) => {
      const board = state.boards[id];
      return {
        id,
        shots: { ...board.shots },
        sunkBoots: board.boots
          .filter((bt) => bt.sunk)
          .map((bt) => ({ ...bt, cells: bt.cells.map((c) => ({ ...c })) })),
        sunkCount: board.boots.filter((bt) => bt.sunk).length,
        fleetSize: state.fleet.length,
        eliminated: !!state.eliminated[id],
        ready: board.ready,
      };
    });

  return {
    playerIds: [...state.playerIds],
    fleet: [...state.fleet],
    phase: state.phase,
    turnId: state.turnId,
    lastShot: state.lastShot,
    winnerId: state.winnerId,
    ready,
    eliminated: { ...state.eliminated },
    own: {
      boots: own.boots.map((bt) => ({
        ...bt,
        cells: bt.cells.map((c) => ({ ...c })),
      })),
      shots: { ...own.shots },
      sunkCount: own.boots.filter((bt) => bt.sunk).length,
    },
    enemies,
  };
}
