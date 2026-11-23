import {
  createUnoState,
  playableCards,
  unoCall,
  unoCatch,
  unoChooseColor,
  unoDraw,
  unoPass,
  unoPlay,
  unoPublicState,
  type UnoState,
} from './uno.engine';

const A = 'a';
const B = 'b';

describe('uno engine', () => {
  it('deals 7 cards to each of 2–6 players', () => {
    const s = createUnoState([A, B, 'c'], () => 0.42);
    expect(s.hands[A]).toHaveLength(7);
    expect(s.hands[B]).toHaveLength(7);
    expect(s.hands.c).toHaveLength(7);
    expect(s.discard).toHaveLength(1);
    expect(s.phase).toBe('play');
  });

  it('rejects fewer than 2 or more than 6', () => {
    expect(() => createUnoState([A])).toThrow(/2–6/);
    expect(() =>
      createUnoState([A, B, 'c', 'd', 'e', 'f', 'g']),
    ).toThrow(/2–6/);
  });

  it('plays a matching number and advances the turn', () => {
    const s = createUnoState([A, B], () => 0.3);
    // Force a known top + hand card.
    s.discard = [{ id: 't', color: 'red', rank: '5' }];
    s.color = 'red';
    s.turnIndex = 0;
    s.hands[A] = [
      { id: 'p1', color: 'red', rank: '7' },
      { id: 'p2', color: 'blue', rank: '1' },
    ];
    s.hands[B] = [{ id: 'q', color: 'yellow', rank: '2' }];
    unoPlay(s, A, 'p1');
    expect(s.discard.at(-1)?.id).toBe('p1');
    expect(s.color).toBe('red');
    expect(s.playerIds[s.turnIndex]).toBe(B);
  });

  it('hides the opponent hand in the public view', () => {
    const s = createUnoState([A, B], () => 0.2);
    const pub = unoPublicState(s, A);
    expect(pub.hand).toHaveLength(7);
    expect(pub.handCounts[B]).toBe(7);
    expect(Object.keys(pub.hand[0])).toEqual(
      expect.arrayContaining(['id', 'color', 'rank']),
    );
  });

  it('forces a color pick for wild, then applies it', () => {
    const s = createUnoState([A, B], () => 0.11);
    s.discard = [{ id: 't', color: 'green', rank: '3' }];
    s.color = 'green';
    s.turnIndex = 0;
    s.hands[A] = [
      { id: 'w', color: 'wild', rank: 'wild' },
      { id: 'keep', color: 'yellow', rank: '1' },
    ];
    s.hands[B] = [{ id: 'q', color: 'blue', rank: '4' }];
    unoPlay(s, A, 'w');
    expect(s.phase).toBe('color');
    expect(s.colorPickerId).toBe(A);
    unoChooseColor(s, A, 'blue');
    expect(s.color).toBe('blue');
    expect(s.phase).toBe('play');
    expect(s.playerIds[s.turnIndex]).toBe(B);
  });

  it('stacks draw-2 onto the next player', () => {
    const s = createUnoState([A, B], () => 0.5);
    s.discard = [{ id: 't', color: 'red', rank: '2' }];
    s.color = 'red';
    s.turnIndex = 0;
    s.hands[A] = [
      { id: 'd2', color: 'red', rank: 'draw2' },
      { id: 'keep', color: 'blue', rank: '8' },
    ];
    s.hands[B] = [
      { id: 'x', color: 'yellow', rank: '1' },
      { id: 'y', color: 'yellow', rank: '3' },
    ];
    const before = s.hands[B].length;
    unoPlay(s, A, 'd2');
    expect(s.pendingDraw).toBe(2);
    expect(s.playerIds[s.turnIndex]).toBe(B);
    expect(s.phase).toBe('play');
    unoDraw(s, B);
    expect(s.hands[B].length).toBe(before + 2);
    expect(s.pendingDraw).toBe(0);
    expect(s.playerIds[s.turnIndex]).toBe(A);
  });

  it('wins when the hand empties', () => {
    const s = createUnoState([A, B], () => 0.7);
    s.discard = [{ id: 't', color: 'blue', rank: '9' }];
    s.color = 'blue';
    s.turnIndex = 0;
    s.hands[A] = [{ id: 'last', color: 'blue', rank: '1' }];
    s.hands[B] = [{ id: 'q', color: 'red', rank: '2' }];
    unoCall(s, A);
    unoPlay(s, A, 'last');
    expect(s.phase).toBe('done');
    expect(s.winnerId).toBe(A);
  });

  it('penalizes a player caught without calling Uno', () => {
    const s = createUnoState([A, B], () => 0.8);
    s.hands[A] = [{ id: 'one', color: 'red', rank: '4' }];
    s.hands[B] = [
      { id: 'b1', color: 'green', rank: '5' },
      { id: 'b2', color: 'green', rank: '6' },
    ];
    expect(s.calledUno[A]).toBeFalsy();
    unoCatch(s, B, A);
    expect(s.hands[A].length).toBe(3);
  });

  it('draw then pass when nothing matches', () => {
    const s = createUnoState([A, B], () => 0.9) as UnoState;
    s.discard = [{ id: 't', color: 'red', rank: '0' }];
    s.color = 'red';
    s.turnIndex = 0;
    s.hands[A] = [{ id: 'only', color: 'blue', rank: '9' }];
    s.deck = [{ id: 'drawn', color: 'yellow', rank: '2' }];
    expect(playableCards(s, A)).toHaveLength(0);
    unoDraw(s, A);
    expect(s.drewThisTurn).toBe(true);
    // Drawn yellow 2 still no match — must pass.
    expect(() => unoPlay(s, A, 'only')).toThrow();
    unoPass(s, A);
    expect(s.playerIds[s.turnIndex]).toBe(B);
  });
});
