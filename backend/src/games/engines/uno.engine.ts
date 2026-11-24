/**
 * Uno — classic multiplayer (2–6). Viewer-scoped public state hides other
 * players' hands (count only). Wild Draw Four / Wild need a chosen color.
 */

export type UnoColor = 'red' | 'yellow' | 'green' | 'blue';
export type UnoRank =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | 'skip'
  | 'reverse'
  | 'draw2'
  | 'wild'
  | 'wild4';

export type UnoCard = {
  id: string;
  color: UnoColor | 'wild';
  rank: UnoRank;
};

export type UnoPhase = 'play' | 'color' | 'done';

export type UnoState = {
  playerIds: string[];
  hands: Record<string, UnoCard[]>;
  deck: UnoCard[];
  discard: UnoCard[];
  /** Active color after wilds / top discard. */
  color: UnoColor;
  direction: 1 | -1;
  turnIndex: number;
  phase: UnoPhase;
  /** Pending draw stack (Draw2 / Wild4 chain). */
  pendingDraw: number;
  /** Who must pick a color after playing wild (phase === 'color'). */
  colorPickerId: string | null;
  /** After a normal draw, player may play the drawn card or pass. */
  drewThisTurn: boolean;
  /** Players who already called Uno while at 1 card. */
  calledUno: Record<string, boolean>;
  winnerId: string | null;
  lastEvent: string | null;
  version: number;
};

export type UnoPublicState = {
  playerIds: string[];
  handCounts: Record<string, number>;
  /** Full hand for the viewing player only. */
  hand: UnoCard[];
  top: UnoCard | null;
  color: UnoColor;
  direction: 1 | -1;
  turnId: string;
  phase: UnoPhase;
  pendingDraw: number;
  colorPickerId: string | null;
  calledUno: Record<string, boolean>;
  deckCount: number;
  winnerId: string | null;
  lastEvent: string | null;
  /** Card ids in your hand that are legal to play right now. */
  playableIds: string[];
  canDraw: boolean;
  canPass: boolean;
  drewThisTurn: boolean;
  version: number;
};

const COLORS: UnoColor[] = ['red', 'yellow', 'green', 'blue'];

function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildUnoDeck(rng: () => number = Math.random): UnoCard[] {
  const cards: UnoCard[] = [];
  let n = 0;
  const push = (color: UnoCard['color'], rank: UnoRank) => {
    cards.push({ id: `c${n++}`, color, rank });
  };
  for (const color of COLORS) {
    push(color, '0');
    for (const r of ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const) {
      push(color, r);
      push(color, r);
    }
    for (const r of ['skip', 'reverse', 'draw2'] as const) {
      push(color, r);
      push(color, r);
    }
  }
  for (let i = 0; i < 4; i++) {
    push('wild', 'wild');
    push('wild', 'wild4');
  }
  return shuffle(cards, rng);
}

function isWild(card: UnoCard): boolean {
  return card.rank === 'wild' || card.rank === 'wild4';
}

export function currentUnoPlayer(state: UnoState): string {
  return state.playerIds[state.turnIndex];
}

function advanceTurn(state: UnoState, steps = 1) {
  const n = state.playerIds.length;
  state.turnIndex =
    (state.turnIndex + steps * state.direction + n * 8) % n;
  state.drewThisTurn = false;
}

function refillDeck(state: UnoState) {
  if (state.deck.length > 0) return;
  if (state.discard.length <= 1) return;
  const top = state.discard[state.discard.length - 1];
  const rest = state.discard.slice(0, -1);
  state.discard = [top];
  state.deck = shuffle(rest);
}

function drawCards(state: UnoState, userId: string, count: number): UnoCard[] {
  const got: UnoCard[] = [];
  for (let i = 0; i < count; i++) {
    refillDeck(state);
    const card = state.deck.pop();
    if (!card) break;
    got.push(card);
    state.hands[userId].push(card);
  }
  return got;
}

export function cardMatches(
  card: UnoCard,
  top: UnoCard,
  color: UnoColor,
  pendingDraw: number,
): boolean {
  if (pendingDraw > 0) {
    // Only stacking same penalty type (simplified: draw2 on draw2, wild4 on wild4).
    if (top.rank === 'draw2') return card.rank === 'draw2';
    if (top.rank === 'wild4') return card.rank === 'wild4';
    return false;
  }
  if (isWild(card)) return true;
  if (card.color === color) return true;
  if (card.rank === top.rank && !isWild(top)) return true;
  return false;
}

export function playableCards(state: UnoState, userId: string): UnoCard[] {
  if (state.phase === 'done' || state.phase === 'color') return [];
  if (currentUnoPlayer(state) !== userId) return [];
  const top = state.discard[state.discard.length - 1];
  if (!top) return [];
  return state.hands[userId].filter((c) =>
    cardMatches(c, top, state.color, state.pendingDraw),
  );
}

export function createUnoState(
  playerIds: string[],
  rng: () => number = Math.random,
): UnoState {
  if (playerIds.length < 2 || playerIds.length > 6) {
    throw new Error('Uno needs 2–6 players');
  }
  const deck = buildUnoDeck(rng);
  const hands: Record<string, UnoCard[]> = {};
  for (const id of playerIds) hands[id] = [];
  for (let i = 0; i < 7; i++) {
    for (const id of playerIds) {
      const c = deck.pop();
      if (c) hands[id].push(c);
    }
  }
  // Flip until a non-wild starts the discard.
  let top = deck.pop()!;
  while (isWild(top) && deck.length > 0) {
    deck.unshift(top);
    top = deck.pop()!;
  }
  if (isWild(top)) {
    top = { ...top, color: 'red', rank: '0' };
  }
  const color = (top.color === 'wild' ? 'red' : top.color) as UnoColor;
  const state: UnoState = {
    playerIds: [...playerIds],
    hands,
    deck,
    discard: [top],
    color,
    direction: 1,
    turnIndex: 0,
    phase: 'play',
    pendingDraw: 0,
    colorPickerId: null,
    drewThisTurn: false,
    calledUno: {},
    winnerId: null,
    lastEvent: 'Deal complete — match the discard',
    version: 1,
  };
  // Opening skip / reverse / draw2 apply to the first player.
  applyActionEffects(state, top, /*opening*/ true);
  return state;
}

function applyActionEffects(
  state: UnoState,
  card: UnoCard,
  opening = false,
) {
  const n = state.playerIds.length;
  if (card.rank === 'reverse') {
    state.direction = state.direction === 1 ? -1 : 1;
    if (n === 2 && !opening) {
      // 2-player reverse = skip
      advanceTurn(state, 1);
    } else if (!opening) {
      advanceTurn(state, 1);
    }
    return;
  }
  if (card.rank === 'skip') {
    advanceTurn(state, opening ? 1 : 2);
    return;
  }
  if (card.rank === 'draw2') {
    state.pendingDraw += 2;
    advanceTurn(state, 1);
    return;
  }
  if (card.rank === 'wild4') {
    state.pendingDraw += 4;
    // Color pick happens before turn advances (phase color).
    return;
  }
  if (card.rank === 'wild') {
    return;
  }
  if (!opening) advanceTurn(state, 1);
}

export function unoPlay(
  state: UnoState,
  userId: string,
  cardId: string,
  chosenColor?: UnoColor,
): void {
  if (state.phase === 'done') throw new Error('Game is over');
  if (state.phase === 'color') throw new Error('Pick a color first');
  if (currentUnoPlayer(state) !== userId) throw new Error('Not your turn');
  const hand = state.hands[userId];
  const idx = hand.findIndex((c) => c.id === cardId);
  if (idx < 0) throw new Error('Card not in your hand');
  const card = hand[idx];
  const top = state.discard[state.discard.length - 1];
  if (!cardMatches(card, top, state.color, state.pendingDraw)) {
    throw new Error('That card does not match');
  }

  hand.splice(idx, 1);
  state.discard.push(card);
  if (hand.length !== 1) delete state.calledUno[userId];
  state.drewThisTurn = false;

  if (isWild(card) && (!chosenColor || !COLORS.includes(chosenColor))) {
    state.phase = 'color';
    state.colorPickerId = userId;
    state.lastEvent = `Played ${card.rank} — pick a color`;
    state.version++;
    checkWin(state, userId);
    return;
  }

  if (isWild(card) && chosenColor) {
    state.color = chosenColor;
  } else if (!isWild(card)) {
    state.color = card.color as UnoColor;
  }

  resolvePlayedCard(state, card);
  state.version++;
  checkWin(state, userId);
}

function resolvePlayedCard(state: UnoState, card: UnoCard) {
  if (card.rank === 'draw2') {
    state.pendingDraw += 2;
    state.lastEvent = `Draw 2 — stack ${state.pendingDraw}`;
    advanceTurn(state, 1);
    return;
  }
  if (card.rank === 'wild4') {
    state.pendingDraw += 4;
    state.lastEvent = `Wild +4 → ${state.color}`;
    advanceTurn(state, 1);
    return;
  }
  if (card.rank === 'skip') {
    state.lastEvent = 'Skip!';
    advanceTurn(state, 2);
    return;
  }
  if (card.rank === 'reverse') {
    state.direction = state.direction === 1 ? -1 : 1;
    if (state.playerIds.length === 2) {
      // With only two players, reversing direction hands the turn right
      // back to the player who just played — same as a Skip in real Uno.
      state.lastEvent = 'Reverse acts as Skip!';
      advanceTurn(state, 2);
    } else {
      state.lastEvent = 'Reverse!';
      advanceTurn(state, 1);
    }
    return;
  }
  if (card.rank === 'wild') {
    state.lastEvent = `Wild → ${state.color}`;
    advanceTurn(state, 1);
    return;
  }
  state.lastEvent = `Played ${state.color} ${card.rank}`;
  advanceTurn(state, 1);
}

export function unoChooseColor(
  state: UnoState,
  userId: string,
  color: UnoColor,
): void {
  if (state.phase !== 'color') throw new Error('No color to pick');
  if (state.colorPickerId !== userId) throw new Error('Not your color pick');
  if (!COLORS.includes(color)) throw new Error('Pick red, yellow, green or blue');
  const top = state.discard[state.discard.length - 1];
  state.color = color;
  state.phase = 'play';
  state.colorPickerId = null;
  resolvePlayedCard(state, top);
  state.version++;
  checkWin(state, userId);
}

export function unoDraw(state: UnoState, userId: string): void {
  if (state.phase !== 'play') throw new Error('Cannot draw now');
  if (currentUnoPlayer(state) !== userId) throw new Error('Not your turn');
  if (state.drewThisTurn) throw new Error('Already drew — play or pass');
  if (state.pendingDraw > 0) {
    const n = state.pendingDraw;
    drawCards(state, userId, n);
    state.pendingDraw = 0;
    state.drewThisTurn = false;
    state.lastEvent = `Drew ${n} from stack`;
    advanceTurn(state, 1);
    state.version++;
    return;
  }
  const playable = playableCards(state, userId);
  if (playable.length > 0) {
    throw new Error('You have a playable card');
  }
  const got = drawCards(state, userId, 1);
  state.drewThisTurn = true;
  state.lastEvent = got.length ? 'Drew a card — play it or pass' : 'Deck empty';
  state.version++;
}

export function unoPass(state: UnoState, userId: string): void {
  if (state.phase !== 'play') throw new Error('Cannot pass now');
  if (currentUnoPlayer(state) !== userId) throw new Error('Not your turn');
  if (state.pendingDraw > 0) throw new Error('You must take the draw stack');
  if (!state.drewThisTurn) throw new Error('Draw first if you cannot play');
  state.drewThisTurn = false;
  state.lastEvent = 'Passed';
  advanceTurn(state, 1);
  state.version++;
}

export function unoCall(state: UnoState, userId: string): void {
  const hand = state.hands[userId];
  if (!hand || hand.length !== 1) throw new Error('Call Uno only at 1 card');
  state.calledUno[userId] = true;
  state.lastEvent = 'Uno!';
  state.version++;
}

export function unoCatch(
  state: UnoState,
  catcherId: string,
  targetId: string,
): void {
  if (!state.hands[targetId]) throw new Error('Unknown player');
  if (state.hands[targetId].length !== 1) {
    throw new Error('They do not have Uno');
  }
  if (state.calledUno[targetId]) throw new Error('Already called Uno');
  if (catcherId === targetId) throw new Error('Cannot catch yourself');
  drawCards(state, targetId, 2);
  delete state.calledUno[targetId];
  state.lastEvent = 'Caught without Uno — +2';
  state.version++;
}

function checkWin(state: UnoState, userId: string) {
  if ((state.hands[userId]?.length ?? 1) === 0) {
    state.phase = 'done';
    state.winnerId = userId;
    state.lastEvent = 'Wins the round!';
  }
}

export function unoForfeit(state: UnoState, userId: string): void {
  if (state.phase === 'done') return;
  const idx = state.playerIds.indexOf(userId);
  if (idx < 0) return;
  // Dump hand into discard bottom, remove player.
  const hand = state.hands[userId] ?? [];
  state.discard = [...hand, ...state.discard];
  delete state.hands[userId];
  delete state.calledUno[userId];
  state.playerIds = state.playerIds.filter((id) => id !== userId);
  if (state.playerIds.length <= 1) {
    state.phase = 'done';
    state.winnerId = state.playerIds[0] ?? null;
    state.lastEvent = 'Opponent left — you win';
    return;
  }
  if (state.colorPickerId === userId) {
    state.colorPickerId = null;
    state.phase = 'play';
    state.color = state.color || 'red';
    advanceTurn(state, 0); // fix index
  }
  if (idx < state.turnIndex) state.turnIndex -= 1;
  state.turnIndex = state.turnIndex % state.playerIds.length;
  if (currentUnoPlayer(state) === undefined) state.turnIndex = 0;
  state.version++;
}

export function unoPublicState(
  state: UnoState,
  viewerId: string,
): UnoPublicState {
  const hand = state.hands[viewerId] ?? [];
  const playable =
    state.phase === 'play' && currentUnoPlayer(state) === viewerId
      ? playableCards(state, viewerId)
      : [];
  const counts: Record<string, number> = {};
  for (const id of state.playerIds) {
    counts[id] = state.hands[id]?.length ?? 0;
  }
  const isTurn = currentUnoPlayer(state) === viewerId;
  const canDraw =
    state.phase === 'play' &&
    isTurn &&
    !state.drewThisTurn &&
    (state.pendingDraw > 0 || playable.length === 0);
  const canPass =
    state.phase === 'play' &&
    isTurn &&
    state.pendingDraw === 0 &&
    state.drewThisTurn;
  return {
    playerIds: [...state.playerIds],
    handCounts: counts,
    hand: hand.map((c) => ({ ...c })),
    top: state.discard.length
      ? { ...state.discard[state.discard.length - 1] }
      : null,
    color: state.color,
    direction: state.direction,
    turnId: currentUnoPlayer(state),
    phase: state.phase,
    pendingDraw: state.pendingDraw,
    colorPickerId: state.colorPickerId,
    calledUno: { ...state.calledUno },
    deckCount: state.deck.length,
    winnerId: state.winnerId,
    lastEvent: state.lastEvent,
    playableIds: playable.map((c) => c.id),
    canDraw,
    canPass,
    drewThisTurn: state.drewThisTurn,
    version: state.version,
  };
}
