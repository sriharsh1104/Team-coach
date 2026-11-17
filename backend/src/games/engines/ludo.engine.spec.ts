import {
  absoluteSquare,
  createLudoState,
  currentPlayer,
  LUDO_HOME_STEP,
  ludoMove,
  ludoRemovePlayer,
  ludoRoll,
  movableTokens,
} from './ludo.engine';

describe('Ludo engine', () => {
  it('seats 2 players opposite each other and 4 players in colour order', () => {
    const two = createLudoState(['a', 'b']);
    expect(two.colors).toEqual({ a: 'red', b: 'yellow' });
    const four = createLudoState(['a', 'b', 'c', 'd']);
    expect(Object.values(four.colors)).toEqual(['red', 'green', 'yellow', 'blue']);
    expect(() => createLudoState(['a'])).toThrow();
  });

  it('needs a 6 to leave base; a non-6 with everything in base passes the turn', () => {
    const s = createLudoState(['a', 'b']);
    expect(movableTokens(s, 'a', 3)).toEqual([]);
    ludoRoll(s, 'a', 3);
    expect(currentPlayer(s)).toBe('b');
    expect(s.phase).toBe('roll');
  });

  it('a 6 brings a token out and grants another roll', () => {
    const s = createLudoState(['a', 'b']);
    ludoRoll(s, 'a', 6);
    expect(s.phase).toBe('move');
    expect(s.movable).toEqual([0, 1, 2, 3]);
    const r = ludoMove(s, 'a', 0);
    expect(s.tokens.a[0]).toBe(0);
    expect(r.extraTurn).toBe(true);
    expect(currentPlayer(s)).toBe('a');
    expect(s.phase).toBe('roll');
  });

  it('three sixes in a row lose the turn', () => {
    const s = createLudoState(['a', 'b']);
    ludoRoll(s, 'a', 6);
    ludoMove(s, 'a', 0);
    ludoRoll(s, 'a', 6);
    ludoMove(s, 'a', 1);
    ludoRoll(s, 'a', 6);
    expect(currentPlayer(s)).toBe('b');
    expect(s.lastEvent).toMatch(/Three sixes/);
  });

  it('captures an opponent on a non-safe square and sends it to base (with extra turn)', () => {
    const s = createLudoState(['a', 'b']);
    // red starts at 0, yellow at 26. Put red token at step 30 (square 30) and
    // yellow token at step 1 (square 27). Red rolls 1 → square 31? No: set up
    // red at step 26 (square 26 is yellow's SAFE start), so use step 27 →
    // square 27 where yellow's token (step 1) sits.
    s.tokens.a[0] = 26; // square 26
    s.tokens.b[0] = 1; // square 27
    ludoRoll(s, 'a', 1);
    const r = ludoMove(s, 'a', 0);
    expect(absoluteSquare('red', s.tokens.a[0])).toBe(27);
    expect(r.captured).toEqual([{ userId: 'b', tokenIndex: 0 }]);
    expect(s.tokens.b[0]).toBe(-1);
    expect(currentPlayer(s)).toBe('a'); // extra turn
  });

  it('never captures on a safe square', () => {
    const s = createLudoState(['a', 'b']);
    s.tokens.a[0] = 25; // red step 25 → square 25
    s.tokens.b[0] = 0; // yellow start, square 26 (safe)
    ludoRoll(s, 'a', 1);
    const r = ludoMove(s, 'a', 0);
    expect(r.captured).toEqual([]);
    expect(s.tokens.b[0]).toBe(0);
  });

  it('requires an exact roll to get home and wins when all four are home', () => {
    const s = createLudoState(['a', 'b']);
    s.tokens.a = [LUDO_HOME_STEP, LUDO_HOME_STEP, LUDO_HOME_STEP, 55];
    expect(movableTokens(s, 'a', 3)).toEqual([]); // 58 > 57
    ludoRoll(s, 'a', 2);
    expect(s.movable).toEqual([3]);
    ludoMove(s, 'a', 3);
    expect(s.winnerId).toBe('a');
    expect(s.phase).toBe('done');
  });

  it('rejects moves out of turn or for immovable tokens', () => {
    const s = createLudoState(['a', 'b']);
    expect(() => ludoRoll(s, 'b', 6)).toThrow('Not your turn');
    ludoRoll(s, 'a', 6);
    expect(() => ludoMove(s, 'b', 0)).toThrow('Not your turn');
    expect(() => ludoMove(s, 'a', 9)).toThrow('cannot move');
  });

  it('removing a player from a 2-player game hands the win to the other', () => {
    const s = createLudoState(['a', 'b']);
    ludoRemovePlayer(s, 'a');
    expect(s.winnerId).toBe('b');
    expect(s.phase).toBe('done');
  });

  it('removing the current player in a 3-player game moves the turn on cleanly', () => {
    const s = createLudoState(['a', 'b', 'c']);
    ludoRoll(s, 'a', 6);
    ludoRemovePlayer(s, 'a');
    expect(s.turnOrder).toEqual(['b', 'c']);
    expect(currentPlayer(s)).toBe('b');
    expect(s.phase).toBe('roll');
  });
});
