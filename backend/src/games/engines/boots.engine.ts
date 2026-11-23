/**
 * Boots — Battleship-style 2-player fleet hunt on a 6×6 board (A–F × 1–6).
 *
 * Each player places boots of configurable lengths (e.g. 5 + 3 + 2),
 * horizontal or vertical. Then they take turns firing at coordinates.
 * Sink every opposing boot to win.
 */

export const BOOTS_COLS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export const BOOTS_ROWS = [1, 2, 3, 4, 5, 6] as const;
export const BOOTS_SIZE = 6;
/** Default fleet matching the sketch: length-5, length-3, length-2. */
export const BOOTS_DEFAULT_FLEET = [5, 3, 2] as const;

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
  /** Cells that have been fired at on this board (by the opponent). */
  shots: Record<string, ShotResult>;
  ready: boolean;
};

export type BootsState = {
  playerIds: [string, string];
  fleet: number[];
  boards: Record<string, BootsPlayerBoard>;
  phase: BootsPhase;
  /** Whose turn it is to fire (battle only). */
  turnId: string | null;
  lastShot: {
    by: string;
    cell: BootsCell;
    result: ShotResult;
    bootLength?: number;
  } | null;
  winnerId: string | null;
};

/** What one client may see — opponent's unhit cells stay hidden. */
export type BootsPublicState = {
  playerIds: [string, string];
  fleet: number[];
  phase: BootsPhase;
  turnId: string | null;
  lastShot: BootsState['lastShot'];
  winnerId: string | null;
  ready: Record<string, boolean>;
  /** Own board: full boots + shots received. */
  own: {
    boots: Boot[];
    shots: Record<string, ShotResult>;
  };
  /** Enemy board: only revealed shot results (no boot shapes until sunk…).
   *  Sunk boots are revealed so the finder sees PQRST-style completion. */
  enemy: {
    shots: Record<string, ShotResult>;
    sunkBoots: Boot[];
  };
  sunkCounts: Record<string, number>;
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
  playerIds: [string, string],
  fleet: number[] = [...BOOTS_DEFAULT_FLEET],
): BootsState {
  const sizes = normalizeFleet(fleet);
  const boards: Record<string, BootsPlayerBoard> = {};
  for (const id of playerIds) {
    boards[id] = { boots: [], shots: {}, ready: false };
  }
  return {
    playerIds,
    fleet: sizes,
    boards,
    phase: 'placing',
    turnId: null,
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

  const [a, b] = state.playerIds;
  if (state.boards[a].ready && state.boards[b].ready) {
    state.phase = 'battle';
    // First seater shoots first.
    state.turnId = a;
  }
}

export function fire(
  state: BootsState,
  userId: string,
  target: BootsCell,
): ShotResult {
  if (state.phase !== 'battle') throw new Error('Not in battle yet');
  if (state.turnId !== userId) throw new Error('Not your turn');
  if (!inBounds(target)) throw new Error('Off the board');

  const [a, b] = state.playerIds;
  const enemyId = userId === a ? b : a;
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

  state.lastShot = { by: userId, cell: target, result, bootLength };

  if (enemy.boots.every((bt) => bt.sunk)) {
    state.phase = 'done';
    state.winnerId = userId;
    state.turnId = null;
  } else {
    state.turnId = enemyId;
  }
  return result;
}

export function bootsForfeit(state: BootsState, userId: string): void {
  if (state.phase === 'done') return;
  const [a, b] = state.playerIds;
  if (userId !== a && userId !== b) return;
  state.phase = 'done';
  state.winnerId = userId === a ? b : a;
  state.turnId = null;
}

export function bootsPublicState(
  state: BootsState,
  viewerId: string,
): BootsPublicState {
  const [a, b] = state.playerIds;
  const enemyId = viewerId === a ? b : viewerId === b ? a : a;
  const own = state.boards[viewerId] ?? state.boards[a];
  const enemy = state.boards[enemyId];

  return {
    playerIds: state.playerIds,
    fleet: [...state.fleet],
    phase: state.phase,
    turnId: state.turnId,
    lastShot: state.lastShot,
    winnerId: state.winnerId,
    ready: {
      [a]: state.boards[a].ready,
      [b]: state.boards[b].ready,
    },
    own: {
      boots: own.boots.map((bt) => ({
        ...bt,
        cells: bt.cells.map((c) => ({ ...c })),
      })),
      shots: { ...own.shots },
    },
    enemy: {
      shots: { ...enemy.shots },
      sunkBoots: enemy.boots
        .filter((bt) => bt.sunk)
        .map((bt) => ({
          ...bt,
          cells: bt.cells.map((c) => ({ ...c })),
        })),
    },
    sunkCounts: {
      [a]: state.boards[b].boots.filter((bt) => bt.sunk).length,
      [b]: state.boards[a].boots.filter((bt) => bt.sunk).length,
    },
  };
}
