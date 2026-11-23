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

describe('boots engine', () => {
  const A = 'u1';
  const B = 'u2';

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

  it('random place + ready + alternating fire sinks a fleet', () => {
    const state = createBootsState([A, B], [2, 2]);
    placeBootsRandom(state, A, () => 0);
    placeBootsRandom(state, B, () => 0.9);
    markReady(state, A);
    markReady(state, B);
    expect(state.phase).toBe('battle');
    expect(state.turnId).toBe(A);

    // Fire every cell on B's board until A wins.
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
    expect(view.enemy.shots['5,0']).toBe('hit');
    expect(view.enemy.sunkBoots).toHaveLength(0);
    fire(state, B, { col: 0, row: 0 }); // B's turn
    fire(state, A, { col: 5, row: 1 }); // sink
    const after = bootsPublicState(state, A);
    expect(after.enemy.sunkBoots).toHaveLength(1);
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
});
