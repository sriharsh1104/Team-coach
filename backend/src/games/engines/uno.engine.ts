/**
 * UNO — 2–4 players, official 108-card deck.
 *
 * Deal seven each, flip one card to start the discard pile, then match the
 * top card by colour or by value. Action cards do what they say on the tin:
 * Skip loses the next player their turn, Reverse flips the direction (and
 * acts as a Skip in a two-player game, as the official rules require), Draw
 * Two and Wild Draw Four hand the next player cards and their turn with it.
 *
 * Hands are secret, so — unlike Cut or Chess — the public state is built per
 * viewer: you get your own cards and everyone else's card *count*.
 *
 * One deliberate simplification: the opening flip keeps drawing until it
 * finds a number card, rather than resolving an action card against the
 * dealer. It makes the first turn predictable and costs nothing in play.
 */

export const UNO_COLORS = ['red', 'blue', 'green', 'yellow'] as const;
export type UnoColor = (typeof UNO_COLORS)[number];

export const UNO_NUMBERS = [
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
] as const;
export const UNO_ACTIONS = ['skip', 'reverse', 'draw2'] as const;
export const UNO_WILDS = ['wild', 'wild4'] as const;

export type UnoValue =
  | (typeof UNO_NUMBERS)[number]
  | (typeof UNO_ACTIONS)[number]
  | (typeof UNO_WILDS)[number];

/** `color` is null for the two wild cards until one is played. */
export type UnoCard = { id: string; color: UnoColor | null; value: UnoValue };

export const UNO_MIN_PLAYERS = 2;
export const UNO_MAX_PLAYERS = 4;
export const UNO_HAND_SIZE = 7;
/** What you draw for playing your second-to-last card without calling UNO. */
export const UNO_PENALTY = 2;

export type UnoPhase = 'play' | 'done';
export type UnoEndReason = 'empty-hand' | 'forfeit';

export type UnoState = {
  playerIds: string[];
  hands: Record<string, UnoCard[]>;
  drawPile: UnoCard[];
  /** Oldest first; the last entry is the card everyone is matching. */
  discard: UnoCard[];
  /** What must be matched — a wild sets this to the colour its player chose. */
  activeColor: UnoColor;
  turnIndex: number;
  /** 1 = clockwise through playerIds, -1 = the other way. */
  direction: 1 | -1;
  phase: UnoPhase;
  /**
   * True once the player to move has taken their one card from the deck.
   * They may then play that card or pass, and nothing else.
   */
  drawnThisTurn: boolean;
  /** The card just drawn, so the UI can glow it rather than hunting for it. */
  drawnCardId: string | null;
  /** Who has shouted UNO and not yet been dealt back above one card. */
  calledUno: Record<string, boolean>;
  winnerId: string | null;
  endReason: UnoEndReason | null;
  lastEvent: string | null;
  version: number;
};

/** Viewer-scoped: your hand in full, everyone else's as a count. */
export type UnoPublicState = {
  playerIds: string[];
  /** The viewer's own cards — empty for a player who is not in the match. */
  hand: UnoCard[];
  /** userId → how many cards they are holding. */
  counts: Record<string, number>;
  topCard: UnoCard | null;
  activeColor: UnoColor;
  turnIndex: number;
  turnId: string;
  direction: 1 | -1;
  drawPileCount: number;
  discardCount: number;
  phase: UnoPhase;
  /** Ids in `hand` that are legal right now — the client never guesses. */
  playable: string[];
  /** True when the viewer has drawn this turn and may now play it or pass. */
  youDrew: boolean;
  drawnCardId: string | null;
  calledUno: Record<string, boolean>;
  winnerId: string | null;
  endReason: UnoEndReason | null;
  lastEvent: string | null;
  version: number;
};

function buildDeck(): UnoCard[] {
  const cards: UnoCard[] = [];
  let n = 0;
  const push = (color: UnoColor | null, value: UnoValue) =>
    cards.push({ id: `${color ?? 'w'}-${value}-${n++}`, color, value });

  for (const color of UNO_COLORS) {
    // One zero per colour, two of everything else — the official make-up.
    push(color, '0');
    for (const value of UNO_NUMBERS.slice(1)) {
      push(color, value as UnoValue);
      push(color, value as UnoValue);
    }
    for (const value of UNO_ACTIONS) {
      push(color, value);
      push(color, value);
    }
  }
  for (let i = 0; i < 4; i++) {
    push(null, 'wild');
    push(null, 'wild4');
  }
  return cards;
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function currentUnoPlayer(state: UnoState): string {
  return state.playerIds[state.turnIndex];
}

export function createUnoState(
  playerIds: string[],
  rng: () => number = Math.random,
): UnoState {
  if (
    playerIds.length < UNO_MIN_PLAYERS ||
    playerIds.length > UNO_MAX_PLAYERS
  ) {
    throw new Error(`UNO needs ${UNO_MIN_PLAYERS}–${UNO_MAX_PLAYERS} players`);
  }
  const pile = shuffle(buildDeck(), rng);
  const hands: Record<string, UnoCard[]> = {};
  for (const id of playerIds) hands[id] = pile.splice(0, UNO_HAND_SIZE);

  // Open on a number card: no action resolves against a dealer who isn't
  // playing, and it means the first player always has a clean match to make.
  let firstIndex = pile.findIndex((c) =>
    UNO_NUMBERS.includes(c.value as never),
  );
  if (firstIndex < 0) firstIndex = 0;
  const [first] = pile.splice(firstIndex, 1);

  return {
    playerIds: [...playerIds],
    hands,
    drawPile: pile,
    discard: [first],
    activeColor: (first.color ?? 'red') as UnoColor,
    turnIndex: 0,
    direction: 1,
    phase: 'play',
    drawnThisTurn: false,
    drawnCardId: null,
    calledUno: Object.fromEntries(playerIds.map((id) => [id, false])),
    winnerId: null,
    endReason: null,
    lastEvent: `Match ${first.color?.toUpperCase()} or ${labelOf(first)} to start`,
    version: 1,
  };
}

export function topCard(state: UnoState): UnoCard | null {
  return state.discard[state.discard.length - 1] ?? null;
}

/** Short face label — "+2", "⊘", "⇄", "W", "+4" or the number itself. */
export function labelOf(card: UnoCard): string {
  switch (card.value) {
    case 'draw2':
      return '+2';
    case 'skip':
      return '⊘';
    case 'reverse':
      return '⇄';
    case 'wild':
      return 'W';
    case 'wild4':
      return '+4';
    default:
      return card.value;
  }
}

export function isPlayable(
  card: UnoCard,
  top: UnoCard | null,
  activeColor: UnoColor,
): boolean {
  if (card.value === 'wild' || card.value === 'wild4') return true;
  if (card.color === activeColor) return true;
  // A wild on top has no face value to match, only the colour its player chose.
  if (!top || top.color === null) return false;
  return card.value === top.value;
}

export function playableFor(state: UnoState, userId: string): string[] {
  if (state.phase !== 'play' || currentUnoPlayer(state) !== userId) return [];
  const top = topCard(state);
  const hand = state.hands[userId] ?? [];
  // After drawing, the one card you drew is the only one you may still play.
  const pool = state.drawnThisTurn
    ? hand.filter((c) => c.id === state.drawnCardId)
    : hand;
  return pool
    .filter((c) => isPlayable(c, top, state.activeColor))
    .map((c) => c.id);
}

/**
 * Refill the draw pile from the discard when it runs dry, keeping the top
 * card face up. If both are exhausted (vanishingly rare) the draw is simply
 * short, which the callers tolerate.
 */
function refill(state: UnoState, rng: () => number) {
  if (state.drawPile.length > 0 || state.discard.length <= 1) return;
  const top = state.discard.pop()!;
  // Wilds go back to being colourless so they can be re-chosen.
  const recycled = state.discard.map((c) =>
    c.value === 'wild' || c.value === 'wild4' ? { ...c, color: null } : c,
  );
  state.drawPile = shuffle(recycled, rng);
  state.discard = [top];
}

function drawCards(
  state: UnoState,
  userId: string,
  count: number,
  rng: () => number,
): UnoCard[] {
  const taken: UnoCard[] = [];
  for (let i = 0; i < count; i++) {
    refill(state, rng);
    const card = state.drawPile.shift();
    if (!card) break;
    taken.push(card);
  }
  const hand = state.hands[userId] ?? (state.hands[userId] = []);
  hand.push(...taken);
  // Anyone back above one card has nothing left to shout about.
  if (hand.length > 1) state.calledUno[userId] = false;
  return taken;
}

/** Move the turn on by `steps` seats in the current direction. */
function advance(state: UnoState, steps: number) {
  const n = state.playerIds.length;
  if (n === 0) return;
  state.turnIndex = (((state.turnIndex + state.direction * steps) % n) + n) % n;
  state.drawnThisTurn = false;
  state.drawnCardId = null;
}

function nextPlayerId(state: UnoState): string {
  const n = state.playerIds.length;
  return state.playerIds[(((state.turnIndex + state.direction) % n) + n) % n];
}

export type UnoPlayResult = {
  card: UnoCard;
  /** Cards the next player was made to take, if any. */
  penalised: { userId: string; count: number } | null;
  /** True when the player was fined for not shouting UNO. */
  missedUno: boolean;
};

/**
 * Play one card from your hand.
 *
 * `chosenColor` is required for a wild and ignored otherwise. `callUno` is
 * the shout: play your second-to-last card without it — and without having
 * pressed the button already — and you take two cards for it.
 */
export function unoPlay(
  state: UnoState,
  userId: string,
  cardId: string,
  chosenColor?: UnoColor,
  callUno = false,
  rng: () => number = Math.random,
): UnoPlayResult {
  if (state.phase !== 'play') throw new Error('Game is over');
  if (currentUnoPlayer(state) !== userId) throw new Error('Not your turn');

  const hand = state.hands[userId] ?? [];
  const index = hand.findIndex((c) => c.id === cardId);
  if (index < 0) throw new Error('That card is not in your hand');
  if (!playableFor(state, userId).includes(cardId)) {
    throw new Error(
      state.drawnThisTurn
        ? 'You can only play the card you just drew'
        : 'That card does not match the pile',
    );
  }

  const card = hand[index];
  const isWild = card.value === 'wild' || card.value === 'wild4';
  if (isWild && !chosenColor)
    throw new Error('Pick a colour for the wild card');
  if (isWild && chosenColor && !UNO_COLORS.includes(chosenColor)) {
    throw new Error('Unknown colour');
  }

  if (callUno) state.calledUno[userId] = true;

  hand.splice(index, 1);
  const played: UnoCard = isWild ? { ...card, color: chosenColor! } : card;
  state.discard.push(played);
  state.activeColor = (isWild ? chosenColor! : card.color!) as UnoColor;
  state.drawnThisTurn = false;
  state.drawnCardId = null;
  state.version++;

  if (hand.length === 0) {
    state.phase = 'done';
    state.winnerId = userId;
    state.endReason = 'empty-hand';
    state.lastEvent = 'Hand emptied — wins the round!';
    return { card: played, penalised: null, missedUno: false };
  }

  // The fine lands before the turn moves on, so the UI can show it against
  // the player who earned it.
  let missedUno = false;
  if (hand.length === 1 && !state.calledUno[userId]) {
    drawCards(state, userId, UNO_PENALTY, rng);
    missedUno = true;
  }

  const victim = nextPlayerId(state);
  let penalised: UnoPlayResult['penalised'] = null;
  const two = state.playerIds.length === 2;

  switch (played.value) {
    case 'skip':
      state.lastEvent = 'Skip — next player loses their turn';
      advance(state, 2);
      break;
    case 'reverse':
      state.direction = (state.direction * -1) as 1 | -1;
      // Heads-up, a Reverse is a Skip: play comes straight back round.
      state.lastEvent = two
        ? 'Reverse — play again'
        : 'Reverse — direction flipped';
      advance(state, two ? 2 : 1);
      break;
    case 'draw2':
      drawCards(state, victim, 2, rng);
      penalised = { userId: victim, count: 2 };
      state.lastEvent = 'Draw Two — next player takes 2 and sits out';
      advance(state, 2);
      break;
    case 'wild4':
      drawCards(state, victim, 4, rng);
      penalised = { userId: victim, count: 4 };
      state.lastEvent = `Wild Draw Four — ${state.activeColor.toUpperCase()}, next player takes 4`;
      advance(state, 2);
      break;
    case 'wild':
      state.lastEvent = `Wild — colour is now ${state.activeColor.toUpperCase()}`;
      advance(state, 1);
      break;
    default:
      state.lastEvent = `Played ${state.activeColor.toUpperCase()} ${labelOf(played)}`;
      advance(state, 1);
  }

  if (missedUno) {
    state.lastEvent = `Forgot to shout UNO — took ${UNO_PENALTY} cards`;
  }
  return { card: played, penalised, missedUno };
}

/** Take your one card from the deck. You may then play it, or pass. */
export function unoDraw(
  state: UnoState,
  userId: string,
  rng: () => number = Math.random,
): { card: UnoCard | null; playable: boolean } {
  if (state.phase !== 'play') throw new Error('Game is over');
  if (currentUnoPlayer(state) !== userId) throw new Error('Not your turn');
  if (state.drawnThisTurn)
    throw new Error('You have already drawn — play it or pass');

  const [card] = drawCards(state, userId, 1, rng);
  state.drawnThisTurn = true;
  state.drawnCardId = card?.id ?? null;
  state.version++;

  const canPlay = !!card && isPlayable(card, topCard(state), state.activeColor);
  state.lastEvent = canPlay
    ? 'Drew a card you can play'
    : 'Drew a card — pass if it will not go';
  return { card: card ?? null, playable: canPlay };
}

/** End your turn after drawing. Only legal once you have taken a card. */
export function unoPass(state: UnoState, userId: string): void {
  if (state.phase !== 'play') throw new Error('Game is over');
  if (currentUnoPlayer(state) !== userId) throw new Error('Not your turn');
  if (!state.drawnThisTurn) throw new Error('Draw a card before passing');
  state.lastEvent = 'Passed';
  state.version++;
  advance(state, 1);
}

/**
 * Shout UNO. Allowed from two cards down, which covers both the official
 * moments: before you play your second-to-last card, and while you hold one.
 */
export function unoCall(state: UnoState, userId: string): void {
  if (state.phase !== 'play') throw new Error('Game is over');
  const hand = state.hands[userId];
  if (!hand) throw new Error('You are not in this match');
  if (hand.length > 2) throw new Error('Too early to shout UNO');
  state.calledUno[userId] = true;
  state.lastEvent = 'UNO called!';
  state.version++;
}

export function unoForfeit(state: UnoState, userId: string): void {
  if (state.phase === 'done') return;
  const idx = state.playerIds.indexOf(userId);
  if (idx < 0) return;

  const wasTheirTurn = state.turnIndex === idx;
  // Their cards go back into the deck rather than out of the game, so a
  // long match does not quietly run the draw pile dry.
  state.drawPile.push(...(state.hands[userId] ?? []));
  delete state.hands[userId];
  delete state.calledUno[userId];
  state.playerIds.splice(idx, 1);

  if (state.playerIds.length <= 1) {
    state.phase = 'done';
    state.winnerId = state.playerIds[0] ?? null;
    state.endReason = 'forfeit';
    state.lastEvent = 'Opponent left — you win';
    state.version++;
    return;
  }

  // Keep pointing at the same seat: removing an earlier player shifts
  // everyone after them down one, and a player who leaves on their own turn
  // hands it to whoever now occupies their index.
  if (idx < state.turnIndex) state.turnIndex -= 1;
  state.turnIndex = state.turnIndex % state.playerIds.length;
  if (wasTheirTurn) {
    state.drawnThisTurn = false;
    state.drawnCardId = null;
  }
  state.lastEvent = 'A player left the game';
  state.version++;
}

export function unoPublicState(
  state: UnoState,
  viewerId: string,
): UnoPublicState {
  const hand = state.hands[viewerId] ?? [];
  const counts: Record<string, number> = {};
  for (const id of state.playerIds) counts[id] = state.hands[id]?.length ?? 0;
  return {
    playerIds: [...state.playerIds],
    hand: hand.map((c) => ({ ...c })),
    counts,
    topCard: topCard(state) ? { ...topCard(state)! } : null,
    activeColor: state.activeColor,
    turnIndex: state.turnIndex,
    turnId: currentUnoPlayer(state),
    direction: state.direction,
    drawPileCount: state.drawPile.length,
    discardCount: state.discard.length,
    phase: state.phase,
    playable: playableFor(state, viewerId),
    youDrew: currentUnoPlayer(state) === viewerId && state.drawnThisTurn,
    drawnCardId:
      currentUnoPlayer(state) === viewerId ? state.drawnCardId : null,
    calledUno: { ...state.calledUno },
    winnerId: state.winnerId,
    endReason: state.endReason,
    lastEvent: state.lastEvent,
    version: state.version,
  };
}
