import {
  UNO_HAND_SIZE,
  UnoCard,
  UnoColor,
  UnoState,
  createUnoState,
  isPlayable,
  playableFor,
  topCard,
  unoCall,
  unoDraw,
  unoForfeit,
  unoPass,
  unoPlay,
  unoPublicState,
} from './uno.engine';

/** Deterministic rng so a deal is the same every run. */
function seeded(seed = 7): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function card(
  color: UnoColor | null,
  value: UnoCard['value'],
  id = `${color}-${value}`,
): UnoCard {
  return { id, color, value };
}

/** A state with hands we control, so a test can set up an exact position. */
function rigged(
  hands: Record<string, UnoCard[]>,
  top: UnoCard,
  over: Partial<UnoState> = {},
): UnoState {
  const base = createUnoState(Object.keys(hands), seeded());
  return {
    ...base,
    hands,
    discard: [top],
    activeColor: (top.color ?? 'red') as UnoColor,
    ...over,
  };
}

describe('uno.engine', () => {
  it('deals seven each and opens on a number card', () => {
    const state = createUnoState(['a', 'b', 'c'], seeded());
    expect(state.hands.a).toHaveLength(UNO_HAND_SIZE);
    expect(state.hands.b).toHaveLength(UNO_HAND_SIZE);
    expect(state.hands.c).toHaveLength(UNO_HAND_SIZE);

    const first = topCard(state)!;
    expect(first.color).not.toBeNull();
    expect(Number.isNaN(Number(first.value))).toBe(false);

    // 108 cards, all accounted for: hands + the flipped card + the deck.
    expect(state.drawPile.length + 3 * UNO_HAND_SIZE + 1).toBe(108);
  });

  it('matches on colour, on value, and always on a wild', () => {
    const top = card('red', '7');
    expect(isPlayable(card('red', '2'), top, 'red')).toBe(true);
    expect(isPlayable(card('blue', '7'), top, 'red')).toBe(true);
    expect(isPlayable(card('blue', '2'), top, 'red')).toBe(false);
    expect(isPlayable(card(null, 'wild'), top, 'red')).toBe(true);

    // A wild on top is matched only by the colour its player chose.
    const wildTop = card(null, 'wild');
    expect(isPlayable(card('green', '7'), wildTop, 'green')).toBe(true);
    expect(isPlayable(card('blue', '7'), wildTop, 'green')).toBe(false);
  });

  it('refuses a card that does not match', () => {
    const state = rigged(
      { a: [card('blue', '2')], b: [card('red', '3')] },
      card('red', '7'),
    );
    expect(() =>
      unoPlay(state, 'a', 'blue-2', undefined, false, seeded()),
    ).toThrow(/does not match/);
  });

  it('moves the turn on after a plain number card', () => {
    const state = rigged(
      {
        a: [card('red', '2'), card('red', '3')],
        b: [card('red', '4'), card('red', '5')],
      },
      card('red', '7'),
    );
    unoPlay(state, 'a', 'red-2', undefined, false, seeded());
    expect(state.turnIndex).toBe(1);
    expect(topCard(state)!.id).toBe('red-2');
    expect(state.activeColor).toBe('red');
  });

  it('skips the next player on Skip, and on Draw Two after dealing them two', () => {
    const hands = {
      a: [card('red', 'skip'), card('red', 'draw2'), card('red', '1')],
      b: [card('blue', '1')],
      c: [card('green', '1')],
    };
    const state = rigged(hands, card('red', '7'));

    unoPlay(state, 'a', 'red-skip', undefined, false, seeded());
    expect(state.playerIds[state.turnIndex]).toBe('c');

    // Back round to a.
    state.turnIndex = 0;
    unoPlay(state, 'a', 'red-draw2', undefined, false, seeded());
    expect(state.hands.b).toHaveLength(3);
    expect(state.playerIds[state.turnIndex]).toBe('c');
  });

  it('flips direction on Reverse, but plays as a Skip heads-up', () => {
    const three = rigged(
      {
        a: [card('red', 'reverse'), card('red', '1')],
        b: [card('blue', '1')],
        c: [card('green', '1')],
      },
      card('red', '7'),
    );
    unoPlay(three, 'a', 'red-reverse', undefined, false, seeded());
    expect(three.direction).toBe(-1);
    expect(three.playerIds[three.turnIndex]).toBe('c');

    const heads = rigged(
      { a: [card('red', 'reverse'), card('red', '1')], b: [card('blue', '1')] },
      card('red', '7'),
    );
    unoPlay(heads, 'a', 'red-reverse', undefined, false, seeded());
    expect(heads.playerIds[heads.turnIndex]).toBe('a');
  });

  it('takes a colour for a wild and hands four cards over on a Wild Draw Four', () => {
    const state = rigged(
      {
        a: [card(null, 'wild4', 'w4'), card('red', '1')],
        b: [card('blue', '1')],
      },
      card('red', '7'),
    );
    expect(() => unoPlay(state, 'a', 'w4', undefined, false, seeded())).toThrow(
      /colour/i,
    );

    unoPlay(state, 'a', 'w4', 'green', false, seeded());
    expect(state.activeColor).toBe('green');
    expect(state.hands.b).toHaveLength(5);
    // +4 also skips them, and heads-up that means play comes back to a.
    expect(state.playerIds[state.turnIndex]).toBe('a');
  });

  it('fines a player two cards for not shouting UNO, and not if they did', () => {
    const quiet = rigged(
      { a: [card('red', '2'), card('red', '3')], b: [card('blue', '1')] },
      card('red', '7'),
    );
    unoPlay(quiet, 'a', 'red-2', undefined, false, seeded());
    expect(quiet.hands.a).toHaveLength(3);
    expect(quiet.lastEvent).toMatch(/Forgot to shout UNO/);

    const loud = rigged(
      { a: [card('red', '2'), card('red', '3')], b: [card('blue', '1')] },
      card('red', '7'),
    );
    unoCall(loud, 'a');
    unoPlay(loud, 'a', 'red-2', undefined, false, seeded());
    expect(loud.hands.a).toHaveLength(1);

    // The shout also rides along on the play itself.
    const inline = rigged(
      { a: [card('red', '2'), card('red', '3')], b: [card('blue', '1')] },
      card('red', '7'),
    );
    unoPlay(inline, 'a', 'red-2', undefined, true, seeded());
    expect(inline.hands.a).toHaveLength(1);
  });

  it('refuses the shout while the hand is still big', () => {
    const state = rigged(
      {
        a: [card('red', '2'), card('red', '3'), card('red', '4')],
        b: [card('blue', '1')],
      },
      card('red', '7'),
    );
    expect(() => unoCall(state, 'a')).toThrow(/Too early/);
  });

  it('ends the round when the last card goes down', () => {
    const state = rigged(
      { a: [card('red', '2')], b: [card('blue', '1')] },
      card('red', '7'),
      { calledUno: { a: true, b: false } },
    );
    unoPlay(state, 'a', 'red-2', undefined, false, seeded());
    expect(state.phase).toBe('done');
    expect(state.winnerId).toBe('a');
    expect(state.endReason).toBe('empty-hand');
  });

  it('lets you draw once, then play only that card or pass', () => {
    const state = rigged(
      { a: [card('blue', '2')], b: [card('blue', '1')] },
      card('red', '7'),
      { drawPile: [card('red', '9', 'drawn'), card('blue', '5', 'spare')] },
    );

    const { card: drawn, playable } = unoDraw(state, 'a');
    expect(drawn!.id).toBe('drawn');
    expect(playable).toBe(true);
    // The blue card in hand is still unplayable, and now so is everything
    // except the card just drawn.
    expect(playableFor(state, 'a')).toEqual(['drawn']);
    expect(() => unoDraw(state, 'a')).toThrow(/already drawn/);

    unoPass(state, 'a');
    expect(state.playerIds[state.turnIndex]).toBe('b');
    expect(state.drawnThisTurn).toBe(false);
  });

  it('will not let you pass without drawing', () => {
    const state = rigged(
      { a: [card('red', '2')], b: [card('blue', '1')] },
      card('red', '7'),
    );
    expect(() => unoPass(state, 'a')).toThrow(/Draw a card/);
  });

  it('blocks everyone who is not the player to move', () => {
    const state = rigged(
      { a: [card('red', '2')], b: [card('red', '3')] },
      card('red', '7'),
    );
    expect(() =>
      unoPlay(state, 'b', 'red-3', undefined, false, seeded()),
    ).toThrow(/Not your turn/);
    expect(() => unoDraw(state, 'b')).toThrow(/Not your turn/);
  });

  it('hands the win over when everyone else leaves', () => {
    const state = rigged(
      { a: [card('red', '2')], b: [card('blue', '1')] },
      card('red', '7'),
    );
    unoForfeit(state, 'b');
    expect(state.phase).toBe('done');
    expect(state.winnerId).toBe('a');
    expect(state.endReason).toBe('forfeit');
  });

  it('shows a viewer their own hand and only the others’ counts', () => {
    const state = rigged(
      { a: [card('red', '2'), card('red', '3')], b: [card('blue', '1')] },
      card('red', '7'),
    );
    const mine = unoPublicState(state, 'a');
    expect(mine.hand.map((c) => c.id)).toEqual(['red-2', 'red-3']);
    expect(mine.counts).toEqual({ a: 2, b: 1 });
    expect(mine.playable).toEqual(['red-2', 'red-3']);

    const theirs = unoPublicState(state, 'b');
    expect(theirs.hand.map((c) => c.id)).toEqual(['blue-1']);
    // Not their turn, so nothing is playable for them yet.
    expect(theirs.playable).toEqual([]);
    expect(theirs.counts).toEqual({ a: 2, b: 1 });
  });

  it('recycles the discard when the draw pile runs out', () => {
    const state = rigged(
      { a: [card('blue', '2')], b: [card('blue', '1')] },
      card('red', '7'),
      {
        drawPile: [],
        discard: [card('red', '1'), card('red', '3'), card('red', '7')],
      },
    );
    const { card: drawn } = unoDraw(state, 'a');
    expect(drawn).not.toBeNull();
    // The face-up card stays put; the rest came back as deck.
    expect(topCard(state)!.id).toBe('red-7');
  });
});
