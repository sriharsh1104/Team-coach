import {
  BOOTS_DEFAULT_FLEET,
  bootsForfeit,
  bootsPublicState,
  canPlaceBoot,
  clearBoots,
  createBootsState,
  fire,
  formatCoord,
  markReady,
  normalizeFleet,
  parseCoord,
  placeBoot,
  placeBootsRandom,
  remainingLengths,
} from './boots.engine';

const A = 'u1';
const B = 'u2';
const C = 'u3';
const D = 'u4';

describe('boots engine', () => {
  it('parses and formats coordinates', () => {
    expect(parseCoord('b2')).toEqual({ col: 1, row: 1 });
    expect(parseCoord('F6')).toEqual({ col: 5, row: 5 });
    expect(parseCoord('Z9')).toBeNull();
    expect(formatCoord({ col: 1, row: 1 })).toBe('B2');
  });

  it('normalizes fleet sizes', () => {
    expect(normalizeFleet([5, 3, 2])).toEqual([5, 3, 2]);
    expect(normalizeFleet([4, 1, 3])).toEqual([4, 3, 1]);
    expect(normalizeFleet([])).toEqual([...BOOTS_DEFAULT_FLEET]);
  });

  it('rejects fewer than 2 or more than 4 players', () => {
    expect(() => createBootsState([A])).toThrow(/2–4/);
    expect(() => createBootsState([A, B, C, D, 'u5'])).toThrow(/2–4/);
  });

  it('places a vertical 5-boot like the sketch (B2–B6)', () => {
    const state = createBootsState([A, B], [5, 3, 2]);
    placeBoot(state, A, { col: 1, row: 1 }, 'vertical');
    expect(state.boards[A].boots[0].cells).toEqual([
      { col: 1, row: 1 },
      { col: 1, row: 2 },
      { col: 1, row: 3 },
      { col: 1, row: 4 },
      { col: 1, row: 5 },
    ]);
    expect(remainingLengths(state.boards[A], state.fleet)).toEqual([3, 2]);
  });

  it('rejects overlapping or out-of-bounds placement', () => {
    const state = createBootsState([A, B], [5, 3]);
    placeBoot(state, A, { col: 0, row: 0 }, 'horizontal');
    expect(canPlaceBoot(state.boards[A], { col: 0, row: 0 }, 3, 'horizontal')).toBe(
      false,
    );
    expect(() =>
      placeBoot(state, A, { col: 4, row: 0 }, 'horizontal'),
    ).toThrow(/does not fit/);
  });

  it('random place + ready + alternating fire sinks a fleet (2 players)', () => {
    const state = createBootsState([A, B], [2, 2]);
    placeBootsRandom(state, A, () => 0);
    placeBootsRandom(state, B, () => 0.9);
    markReady(state, A);
    markReady(state, B);
    expect(state.phase).toBe('battle');
    expect(state.turnId).toBe(A);

    // Fire every cell on the opponent's board until someone wins. With only
    // one live opponent each, `fire` auto-resolves the target.
    let guard = 0;
    while (state.phase === 'battle' && guard++ < 40) {
      const who = state.turnId!;
      const enemy = who === A ? B : A;
      const board = state.boards[enemy];
      let shot = false;
      for (let row = 0; row < 6 && !shot; row++) {
        for (let col = 0; col < 6 && !shot; col++) {
          const key = `${col},${row}`;
          if (!board.shots[key]) {
            fire(state, who, { col, row });
            shot = true;
          }
        }
      }
    }
    expect(state.phase).toBe('done');
    expect(state.winnerId).toBeTruthy();
  });

  it('hides enemy boots until sunk in the public view', () => {
    const state = createBootsState([A, B], [2]);
    placeBoot(state, A, { col: 0, row: 0 }, 'horizontal');
    placeBoot(state, B, { col: 5, row: 0 }, 'vertical');
    markReady(state, A);
    markReady(state, B);
    fire(state, A, { col: 5, row: 0 });
    const view = bootsPublicState(state, A);
    expect(view.enemies).toHaveLength(1);
    expect(view.enemies[0].shots['5,0']).toBe('hit');
    expect(view.enemies[0].sunkBoots).toHaveLength(0);
    fire(state, B, { col: 0, row: 0 }); // B's turn
    fire(state, A, { col: 5, row: 1 }); // sink
    const after = bootsPublicState(state, A);
    expect(after.enemies[0].sunkBoots).toHaveLength(1);
    expect(after.winnerId).toBe(A);
  });

  it('forfeit awards the other player', () => {
    const state = createBootsState([A, B]);
    placeBootsRandom(state, A);
    placeBootsRandom(state, B);
    markReady(state, A);
    markReady(state, B);
    bootsForfeit(state, A);
    expect(state.winnerId).toBe(B);
  });

  it('clearBoots resets placement before ready', () => {
    const state = createBootsState([A, B], [2]);
    placeBoot(state, A, { col: 0, row: 0 }, 'horizontal');
    clearBoots(state, A);
    expect(state.boards[A].boots).toHaveLength(0);
  });

  it('requires a target when more than one opponent is alive (3+ players)', () => {
    const state = createBootsState([A, B, C], [2]);
    for (const id of [A, B, C]) {
      placeBootsRandom(state, id, () => 0);
      markReady(state, id);
    }
    expect(state.phase).toBe('battle');
    expect(state.turnId).toBe(A);
    expect(() => fire(state, A, { col: 0, row: 0 })).toThrow(/Choose who to fire at/);
    expect(() => fire(state, A, { col: 0, row: 0 }, 'not-a-player')).toThrow(
      /not a live target/,
    );
  });

  it('round-robins turn order over seats, skipping eliminated players (3 players)', () => {
    const state = createBootsState([A, B, C], [1]);
    // One boot each, at a different known cell on their own board (A1/B1/C1
    // by column), so each sink target is unambiguous below.
    placeBoot(state, A, { col: 0, row: 0 }, 'horizontal');
    placeBoot(state, B, { col: 1, row: 0 }, 'horizontal');
    placeBoot(state, C, { col: 2, row: 0 }, 'horizontal');
    markReady(state, A);
    markReady(state, B);
    markReady(state, C);
    expect(state.turnId).toBe(A);

    // A misses B — turn passes to B regardless of who A targeted.
    fire(state, A, { col: 5, row: 5 }, B);
    expect(state.turnId).toBe(B);

    // B sinks C's lone boot (at C2, i.e. col 2 row 0) — C is eliminated, turn
    // still goes to the next seat in order (C), but C is out, so it skips
    // straight to A.
    fire(state, B, { col: 2, row: 0 }, C);
    expect(state.eliminated[C]).toBe(true);
    expect(state.phase).toBe('battle'); // two players still alive
    expect(state.turnId).toBe(A);

    // Down to A vs B: no target needed, and sinking B's boot (at B1, col 1
    // row 0) ends the match.
    fire(state, A, { col: 1, row: 0 });
    expect(state.phase).toBe('done');
    expect(state.winnerId).toBe(A);
  });

  it('forfeiting mid-battle hands the turn on and eliminates the quitter', () => {
    const state = createBootsState([A, B, C], [1]);
    placeBoot(state, A, { col: 0, row: 0 }, 'horizontal');
    placeBoot(state, B, { col: 1, row: 0 }, 'horizontal');
    placeBoot(state, C, { col: 2, row: 0 }, 'horizontal');
    markReady(state, A);
    markReady(state, B);
    markReady(state, C);
    expect(state.turnId).toBe(A);

    bootsForfeit(state, A);
    expect(state.eliminated[A]).toBe(true);
    expect(state.phase).toBe('battle');
    expect(state.turnId).toBe(B);

    bootsForfeit(state, B);
    expect(state.phase).toBe('done');
    expect(state.winnerId).toBe(C);
  });
});
