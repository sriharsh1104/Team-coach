import {
  CUT_TARGET,
  createCutState,
  cutDraw,
  cutForfeit,
  cutPublicState,
  currentCutPlayer,
  remainingFor,
} from './cut.engine';

const A = 'a';
const B = 'b';
const C = 'c';

/** Feeds `cutDraw` an exact sequence of numbers instead of real randomness. */
function scripted(numbers: number[]): () => number {
  let i = 0;
  return () => {
    const n = numbers[Math.min(i++, numbers.length - 1)];
    // cutDraw maps [0,1) onto 1..9, so invert that to hit `n` exactly.
    return (n - 1) / 9 + 0.0001;
  };
}

describe('cut engine', () => {
  it('rejects fewer than 2 or more than 4 players', () => {
    expect(() => createCutState([A])).toThrow(/2–4/);
    expect(() => createCutState([A, B, C, 'd', 'e'])).toThrow(/2–4/);
  });

  it('starts everyone on an empty board with the first seat to draw', () => {
    const state = createCutState([A, B]);
    expect(state.cut[A]).toEqual([]);
    expect(state.cut[B]).toEqual([]);
    expect(currentCutPlayer(state)).toBe(A);
    expect(remainingFor(state, A)).toHaveLength(CUT_TARGET);
  });

  it('cuts a fresh number and keeps the card with the same player', () => {
    const state = createCutState([A, B]);
    const rng = scripted([4]);

    const result = cutDraw(state, A, rng);
    expect(result).toEqual({ number: 4, repeat: false });
    expect(state.cut[A]).toEqual([4]);
    // The whole point of the game: a hit does NOT pass the turn.
    expect(currentCutPlayer(state)).toBe(A);
  });

  it('passes the turn the moment an already-cut number comes up', () => {
    const state = createCutState([A, B]);

    cutDraw(state, A, scripted([7]));
    expect(state.cut[A]).toEqual([7]);
    expect(currentCutPlayer(state)).toBe(A);

    const repeat = cutDraw(state, A, scripted([7]));
    expect(repeat).toEqual({ number: 7, repeat: true });
    // Nothing new cut, and the card moves on.
    expect(state.cut[A]).toEqual([7]);
    expect(state.lastWasRepeat).toBe(true);
    expect(currentCutPlayer(state)).toBe(B);
  });

  it('refuses a draw from anyone but the player holding the card', () => {
    const state = createCutState([A, B]);
    expect(() => cutDraw(state, B, scripted([3]))).toThrow(/Not your turn/);
  });

  it('rotates through all seats in order', () => {
    const state = createCutState([A, B, C]);
    // Each player cuts one number, then repeats it to hand the card on.
    for (const player of [A, B, C]) {
      cutDraw(state, player, scripted([5]));
      cutDraw(state, player, scripted([5]));
    }
    expect(currentCutPlayer(state)).toBe(A);
    expect(state.cut[A]).toEqual([5]);
    expect(state.cut[C]).toEqual([5]);
  });

  it('wins the moment the ninth number is cut, and locks the game after', () => {
    const state = createCutState([A, B]);
    const rng = scripted([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    for (let i = 0; i < CUT_TARGET; i++) cutDraw(state, A, rng);

    expect(state.cut[A]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(state.phase).toBe('done');
    expect(state.winnerId).toBe(A);
    expect(() => cutDraw(state, A, rng)).toThrow(/Game is over/);
  });

  it('hands the win over when the only opponent leaves', () => {
    const state = createCutState([A, B]);
    cutForfeit(state, A);
    expect(state.phase).toBe('done');
    expect(state.winnerId).toBe(B);
  });

  it('keeps a 3-player game going when one player leaves mid-turn', () => {
    const state = createCutState([A, B, C]);
    expect(currentCutPlayer(state)).toBe(A);

    cutForfeit(state, A);
    expect(state.phase).toBe('play');
    expect(state.playerIds).toEqual([B, C]);
    // A left on their own turn, so the card goes to whoever took that seat.
    expect(currentCutPlayer(state)).toBe(B);
    expect(state.cut[A]).toBeUndefined();
  });

  it('shows the same public state to everyone, with no hidden fields', () => {
    const state = createCutState([A, B]);
    cutDraw(state, A, scripted([6]));

    const view = cutPublicState(state);
    expect(view.turnId).toBe(A);
    expect(view.cut[A]).toEqual([6]);
    expect(view.cut[B]).toEqual([]);
    expect(view.lastDraw).toBe(6);
    expect(view.lastDrawBy).toBe(A);
    // Copies, not references — mutating the view must not touch the game.
    view.cut[A].push(9);
    expect(state.cut[A]).toEqual([6]);
  });
});
