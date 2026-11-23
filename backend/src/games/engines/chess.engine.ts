/**
 * Chess — pure game logic, no I/O.
 *
 * Full FIDE movement rules: castling, en passant, promotion, check, and every
 * way a game can end (checkmate, stalemate, the fifty-move rule, threefold
 * repetition and insufficient material).
 *
 * Board layout is a flat 64-square array with index 0 = a8 and index 63 = h1,
 * so `rank = Math.floor(sq / 8)` counts downwards from Black's home rank and
 * `file = sq % 8` counts a→h. White therefore moves towards *lower* indices.
 * One array and two integers beats a nested array for the thing this file
 * does most: sliding a piece until it hits something.
 */

export type ChessColor = 'w' | 'b';
export type ChessPieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
/** Promotion is restricted to the four pieces FIDE allows. */
export type ChessPromotion = 'q' | 'r' | 'b' | 'n';

export type ChessPiece = { type: ChessPieceType; color: ChessColor };

export type ChessSquare = string;

export type ChessMove = {
  from: ChessSquare;
  to: ChessSquare;
  promotion?: ChessPromotion;
};

export type ChessMoveRecord = ChessMove & {
  piece: ChessPieceType;
  color: ChessColor;
  /** Piece captured by this move, if any (set for en passant too). */
  captured?: ChessPieceType;
  castle?: 'king' | 'queen';
  enPassant?: boolean;
  check?: boolean;
  checkmate?: boolean;
  /** Standard algebraic notation, e.g. "Nf3", "exd5", "O-O", "e8=Q+". */
  san: string;
};

export type ChessEndReason =
  | 'checkmate'
  | 'stalemate'
  | 'fifty-move'
  | 'threefold'
  | 'insufficient-material'
  | 'forfeit';

export type ChessState = {
  /** [white, black] — index 0 always plays White. */
  playerIds: [string, string];
  /** 64 squares, null where empty. */
  board: (ChessPiece | null)[];
  turn: ChessColor;
  /** Castling rights that have not been lost yet. */
  castling: { w: { king: boolean; queen: boolean }; b: { king: boolean; queen: boolean } };
  /** Square a pawn may be captured on by en passant this move only. */
  enPassant: ChessSquare | null;
  /** Plies since the last capture or pawn move — the fifty-move counter. */
  halfmoveClock: number;
  fullmove: number;
  phase: 'play' | 'done';
  winnerId: string | null;
  endReason: ChessEndReason | null;
  history: ChessMoveRecord[];
  /**
   * Position-signature → how many times it has occurred. Threefold repetition
   * compares placement + side to move + castling + en passant, which is
   * exactly what `positionKey` builds.
   */
  repetition: Record<string, number>;
};

export type ChessPublicState = {
  playerIds: [string, string];
  board: (ChessPiece | null)[];
  turn: ChessColor;
  /** The viewer's colour, or null when they are only watching. */
  yourColor: ChessColor | null;
  /** Legal moves for the viewer, empty when it is not their turn. */
  legalMoves: ChessMove[];
  inCheck: boolean;
  phase: ChessState['phase'];
  winnerId: string | null;
  endReason: ChessEndReason | null;
  /** Last move, so the board can highlight it. */
  lastMove: ChessMoveRecord | null;
  history: ChessMoveRecord[];
  halfmoveClock: number;
  fullmove: number;
  /** Captured pieces per colour, for the side trays. */
  captured: { w: ChessPieceType[]; b: ChessPieceType[] };
};

const FILES = 'abcdefgh';
const BACK_RANK: ChessPieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

export function squareToIndex(square: ChessSquare): number {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  if (file < 0 || !Number.isInteger(rank) || rank < 1 || rank > 8) return -1;
  return (8 - rank) * 8 + file;
}

export function indexToSquare(index: number): ChessSquare {
  return `${FILES[index % 8]}${8 - Math.floor(index / 8)}`;
}

const onBoard = (index: number) => index >= 0 && index < 64;
const fileOf = (index: number) => index % 8;
const rankOf = (index: number) => Math.floor(index / 8);

/** Sliding directions, as (file, rank) steps. */
const DIAGONALS: [number, number][] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const STRAIGHTS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const KNIGHT_STEPS: [number, number][] = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];

/**
 * Step from a square by whole files/ranks, returning -1 when the move leaves
 * the board. Going through file/rank rather than raw index arithmetic is what
 * stops a rook on h4 from "wrapping" onto a5.
 */
function offset(index: number, df: number, dr: number): number {
  const file = fileOf(index) + df;
  const rank = rankOf(index) - dr;
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return -1;
  return rank * 8 + file;
}

export function createChessState(playerIds: [string, string]): ChessState {
  const board: (ChessPiece | null)[] = Array(64).fill(null);
  for (let file = 0; file < 8; file++) {
    board[file] = { type: BACK_RANK[file], color: 'b' };
    board[8 + file] = { type: 'p', color: 'b' };
    board[48 + file] = { type: 'p', color: 'w' };
    board[56 + file] = { type: BACK_RANK[file], color: 'w' };
  }
  const state: ChessState = {
    playerIds,
    board,
    turn: 'w',
    castling: {
      w: { king: true, queen: true },
      b: { king: true, queen: true },
    },
    enPassant: null,
    halfmoveClock: 0,
    fullmove: 1,
    phase: 'play',
    winnerId: null,
    endReason: null,
    history: [],
    repetition: {},
  };
  state.repetition[positionKey(state)] = 1;
  return state;
}

export function colorOf(state: ChessState, userId: string): ChessColor | null {
  if (state.playerIds[0] === userId) return 'w';
  if (state.playerIds[1] === userId) return 'b';
  return null;
}

function playerFor(state: ChessState, color: ChessColor): string {
  return color === 'w' ? state.playerIds[0] : state.playerIds[1];
}

const other = (color: ChessColor): ChessColor => (color === 'w' ? 'b' : 'w');

function findKing(board: (ChessPiece | null)[], color: ChessColor): number {
  for (let i = 0; i < 64; i++) {
    const piece = board[i];
    if (piece && piece.type === 'k' && piece.color === color) return i;
  }
  return -1;
}

/**
 * Is `target` attacked by any piece of `byColor`?
 *
 * Walks outwards from the target instead of generating every enemy move —
 * this runs for every candidate move during legality filtering, so it is the
 * hot path.
 */
export function isSquareAttacked(
  board: (ChessPiece | null)[],
  target: number,
  byColor: ChessColor,
): boolean {
  // Pawns. A white pawn on e4 attacks d5/f5, i.e. it sits *below* the square
  // it attacks, so we look in the opposite direction from the target.
  const pawnRankStep = byColor === 'w' ? -1 : 1;
  for (const df of [-1, 1]) {
    const from = offset(target, df, pawnRankStep);
    const piece = from >= 0 ? board[from] : null;
    if (piece && piece.color === byColor && piece.type === 'p') return true;
  }

  for (const [df, dr] of KNIGHT_STEPS) {
    const from = offset(target, df, dr);
    const piece = from >= 0 ? board[from] : null;
    if (piece && piece.color === byColor && piece.type === 'n') return true;
  }

  for (const [df, dr] of [...DIAGONALS, ...STRAIGHTS]) {
    const diagonal = df !== 0 && dr !== 0;
    let current = offset(target, df, dr);
    let distance = 1;
    while (current >= 0) {
      const piece = board[current];
      if (piece) {
        if (piece.color === byColor) {
          if (
            piece.type === 'q' ||
            (diagonal && piece.type === 'b') ||
            (!diagonal && piece.type === 'r') ||
            (distance === 1 && piece.type === 'k')
          ) {
            return true;
          }
        }
        break;
      }
      current = offset(current, df, dr);
      distance++;
    }
  }
  return false;
}

export function isInCheck(state: ChessState, color: ChessColor): boolean {
  const king = findKing(state.board, color);
  if (king < 0) return false;
  return isSquareAttacked(state.board, king, other(color));
}

/**
 * Moves a piece can make by its movement pattern alone — this does NOT check
 * whether the mover's own king is left in check. `legalMoves` filters those
 * out; keeping the two apart is what makes pins fall out for free.
 */
function pseudoLegalMoves(state: ChessState, color: ChessColor): ChessMove[] {
  const moves: ChessMove[] = [];
  const { board } = state;

  const push = (from: number, to: number) => {
    const target = board[to];
    if (target && target.color === color) return false;
    moves.push({ from: indexToSquare(from), to: indexToSquare(to) });
    return !target;
  };

  for (let from = 0; from < 64; from++) {
    const piece = board[from];
    if (!piece || piece.color !== color) continue;

    if (piece.type === 'p') {
      const forward = color === 'w' ? 1 : -1;
      const startRank = color === 'w' ? 6 : 1;
      const promotionRank = color === 'w' ? 0 : 7;

      const one = offset(from, 0, forward);
      if (one >= 0 && !board[one]) {
        addPawnMove(moves, from, one, promotionRank);
        if (rankOf(from) === startRank) {
          const two = offset(from, 0, forward * 2);
          if (two >= 0 && !board[two]) {
            moves.push({ from: indexToSquare(from), to: indexToSquare(two) });
          }
        }
      }
      for (const df of [-1, 1]) {
        const diagonal = offset(from, df, forward);
        if (diagonal < 0) continue;
        const target = board[diagonal];
        if (target && target.color !== color) {
          addPawnMove(moves, from, diagonal, promotionRank);
        } else if (
          !target &&
          state.enPassant &&
          squareToIndex(state.enPassant) === diagonal
        ) {
          moves.push({
            from: indexToSquare(from),
            to: indexToSquare(diagonal),
          });
        }
      }
      continue;
    }

    if (piece.type === 'n') {
      for (const [df, dr] of KNIGHT_STEPS) {
        const to = offset(from, df, dr);
        if (to >= 0) push(from, to);
      }
      continue;
    }

    if (piece.type === 'k') {
      for (const [df, dr] of [...DIAGONALS, ...STRAIGHTS]) {
        const to = offset(from, df, dr);
        if (to >= 0) push(from, to);
      }
      addCastlingMoves(state, color, from, moves);
      continue;
    }

    const dirs =
      piece.type === 'b'
        ? DIAGONALS
        : piece.type === 'r'
          ? STRAIGHTS
          : [...DIAGONALS, ...STRAIGHTS];
    for (const [df, dr] of dirs) {
      let to = offset(from, df, dr);
      while (to >= 0 && push(from, to)) {
        to = offset(to, df, dr);
      }
    }
  }
  return moves;
}

function addPawnMove(
  moves: ChessMove[],
  from: number,
  to: number,
  promotionRank: number,
) {
  const square = { from: indexToSquare(from), to: indexToSquare(to) };
  if (rankOf(to) === promotionRank) {
    for (const promotion of ['q', 'r', 'b', 'n'] as ChessPromotion[]) {
      moves.push({ ...square, promotion });
    }
    return;
  }
  moves.push(square);
}

/**
 * Castling needs more than empty squares: the king may not start in check,
 * pass through an attacked square, or land on one. The rook's path only has
 * to be empty — it may legally pass through attack.
 */
function addCastlingMoves(
  state: ChessState,
  color: ChessColor,
  kingIndex: number,
  moves: ChessMove[],
) {
  const rights = state.castling[color];
  const homeRank = color === 'w' ? 7 : 0;
  if (rankOf(kingIndex) !== homeRank || fileOf(kingIndex) !== 4) return;
  if (isSquareAttacked(state.board, kingIndex, other(color))) return;

  const base = homeRank * 8;
  if (rights.king) {
    const [f1, g1, h1] = [base + 5, base + 6, base + 7];
    const rook = state.board[h1];
    if (
      rook?.type === 'r' &&
      rook.color === color &&
      !state.board[f1] &&
      !state.board[g1] &&
      !isSquareAttacked(state.board, f1, other(color)) &&
      !isSquareAttacked(state.board, g1, other(color))
    ) {
      moves.push({ from: indexToSquare(kingIndex), to: indexToSquare(g1) });
    }
  }
  if (rights.queen) {
    const [b1, c1, d1, a1] = [base + 1, base + 2, base + 3, base];
    const rook = state.board[a1];
    if (
      rook?.type === 'r' &&
      rook.color === color &&
      !state.board[b1] &&
      !state.board[c1] &&
      !state.board[d1] &&
      !isSquareAttacked(state.board, d1, other(color)) &&
      !isSquareAttacked(state.board, c1, other(color))
    ) {
      moves.push({ from: indexToSquare(kingIndex), to: indexToSquare(c1) });
    }
  }
}

/** Every move `color` may actually play — pseudo-legal minus self-check. */
export function legalMoves(state: ChessState, color: ChessColor): ChessMove[] {
  return pseudoLegalMoves(state, color).filter((move) => {
    const next = cloneForTrial(state);
    applyMoveUnchecked(next, move);
    return !isInCheck(next, color);
  });
}

/** Board-only clone — enough to test a move, without copying history. */
function cloneForTrial(state: ChessState): ChessState {
  return {
    ...state,
    board: [...state.board],
    castling: {
      w: { ...state.castling.w },
      b: { ...state.castling.b },
    },
    history: [],
    repetition: {},
  };
}

/**
 * Apply a move to the board with no legality checking at all. Only ever call
 * this on a clone, or after `legalMoves` has vouched for the move.
 */
function applyMoveUnchecked(state: ChessState, move: ChessMove): ChessMoveRecord {
  const from = squareToIndex(move.from);
  const to = squareToIndex(move.to);
  const piece = state.board[from]!;
  const color = piece.color;
  let captured = state.board[to]?.type;
  let castle: 'king' | 'queen' | undefined;
  let enPassantCapture = false;

  if (
    piece.type === 'p' &&
    state.enPassant &&
    to === squareToIndex(state.enPassant) &&
    !state.board[to]
  ) {
    // The captured pawn sits beside the moving pawn, not on the target square.
    const victim = offset(to, 0, color === 'w' ? -1 : 1);
    captured = state.board[victim]?.type;
    state.board[victim] = null;
    enPassantCapture = true;
  }

  state.board[to] = move.promotion
    ? { type: move.promotion, color }
    : piece;
  state.board[from] = null;

  if (piece.type === 'k' && Math.abs(fileOf(to) - fileOf(from)) === 2) {
    const rank = rankOf(from) * 8;
    if (fileOf(to) === 6) {
      state.board[rank + 5] = state.board[rank + 7];
      state.board[rank + 7] = null;
      castle = 'king';
    } else {
      state.board[rank + 3] = state.board[rank];
      state.board[rank] = null;
      castle = 'queen';
    }
  }

  // Rights are lost by the king moving, the rook moving, or the rook being
  // captured on its home square — all three, or castling comes back later.
  if (piece.type === 'k') {
    state.castling[color] = { king: false, queen: false };
  }
  const homeRank = color === 'w' ? 7 : 0;
  if (piece.type === 'r' && rankOf(from) === homeRank) {
    if (fileOf(from) === 0) state.castling[color].queen = false;
    if (fileOf(from) === 7) state.castling[color].king = false;
  }
  const enemyHome = color === 'w' ? 0 : 7;
  if (rankOf(to) === enemyHome) {
    if (fileOf(to) === 0) state.castling[other(color)].queen = false;
    if (fileOf(to) === 7) state.castling[other(color)].king = false;
  }

  state.enPassant =
    piece.type === 'p' && Math.abs(rankOf(to) - rankOf(from)) === 2
      ? indexToSquare(offset(from, 0, color === 'w' ? 1 : -1))
      : null;

  state.halfmoveClock =
    piece.type === 'p' || captured ? 0 : state.halfmoveClock + 1;
  if (color === 'b') state.fullmove += 1;
  state.turn = other(color);

  return {
    ...move,
    piece: piece.type,
    color,
    captured,
    castle,
    enPassant: enPassantCapture || undefined,
    san: '',
  };
}

/**
 * Standard algebraic notation. Built before the move is applied, because the
 * disambiguation rules need to know which other pieces could also have
 * reached the target square from the current position.
 */
function toSan(
  state: ChessState,
  move: ChessMove,
  record: ChessMoveRecord,
  givesCheck: boolean,
  isMate: boolean,
): string {
  if (record.castle) {
    return `${record.castle === 'king' ? 'O-O' : 'O-O-O'}${isMate ? '#' : givesCheck ? '+' : ''}`;
  }
  const from = squareToIndex(move.from);
  const to = squareToIndex(move.to);
  const capture = !!record.captured;
  let text: string;

  if (record.piece === 'p') {
    text = capture ? `${FILES[fileOf(from)]}x${move.to}` : move.to;
    if (move.promotion) text += `=${move.promotion.toUpperCase()}`;
  } else {
    const rivals = pseudoLegalMoves(state, record.color).filter((other_) => {
      const index = squareToIndex(other_.from);
      return (
        index !== from &&
        squareToIndex(other_.to) === to &&
        state.board[index]?.type === record.piece
      );
    });
    let hint = '';
    if (rivals.length > 0) {
      const sameFile = rivals.some(
        (r) => fileOf(squareToIndex(r.from)) === fileOf(from),
      );
      const sameRank = rivals.some(
        (r) => rankOf(squareToIndex(r.from)) === rankOf(from),
      );
      hint = !sameFile
        ? FILES[fileOf(from)]
        : !sameRank
          ? String(8 - rankOf(from))
          : move.from;
    }
    text = `${record.piece.toUpperCase()}${hint}${capture ? 'x' : ''}${move.to}`;
  }
  return `${text}${isMate ? '#' : givesCheck ? '+' : ''}`;
}

/** Placement + turn + castling + en passant — the FIDE repetition signature. */
export function positionKey(state: ChessState): string {
  const placement = state.board
    .map((piece) => (piece ? `${piece.color}${piece.type}` : '.'))
    .join('');
  const castling = `${state.castling.w.king ? 'K' : ''}${state.castling.w.queen ? 'Q' : ''}${state.castling.b.king ? 'k' : ''}${state.castling.b.queen ? 'q' : ''}`;
  return `${placement}|${state.turn}|${castling}|${state.enPassant ?? '-'}`;
}

/**
 * Neither side can force mate — king vs king, king+bishop, king+knight, or
 * king+bishop each on the same colour square. Anything else may still be
 * winnable, so it is not a draw.
 */
function insufficientMaterial(board: (ChessPiece | null)[]): boolean {
  const minors: { color: ChessColor; type: ChessPieceType; square: number }[] =
    [];
  for (let i = 0; i < 64; i++) {
    const piece = board[i];
    if (!piece || piece.type === 'k') continue;
    if (piece.type === 'p' || piece.type === 'q' || piece.type === 'r') {
      return false;
    }
    minors.push({ color: piece.color, type: piece.type, square: i });
  }
  if (minors.length <= 1) return true;
  if (minors.length === 2) {
    const [a, b] = minors;
    if (a.type === 'b' && b.type === 'b' && a.color !== b.color) {
      const lightA = (fileOf(a.square) + rankOf(a.square)) % 2 === 0;
      const lightB = (fileOf(b.square) + rankOf(b.square)) % 2 === 0;
      return lightA === lightB;
    }
  }
  return false;
}

export function chessMove(
  state: ChessState,
  userId: string,
  move: ChessMove,
): ChessMoveRecord {
  if (state.phase !== 'play') throw new Error('Game is over');
  const color = colorOf(state, userId);
  if (!color) throw new Error('You are not in this game');
  if (color !== state.turn) throw new Error('Not your turn');

  const legal = legalMoves(state, color).find(
    (candidate) =>
      candidate.from === move.from &&
      candidate.to === move.to &&
      (candidate.promotion ?? null) === (move.promotion ?? null),
  );
  if (!legal) throw new Error('Illegal move');

  // SAN is computed against the position *before* the move.
  const preview = cloneForTrial(state);
  const previewRecord = applyMoveUnchecked(preview, legal);
  const opponent = other(color);
  const givesCheck = isInCheck(preview, opponent);
  const opponentHasMoves = legalMoves(preview, opponent).length > 0;
  const isMate = givesCheck && !opponentHasMoves;
  const san = toSan(state, legal, previewRecord, givesCheck, isMate);

  const record = applyMoveUnchecked(state, legal);
  record.san = san;
  record.check = givesCheck || undefined;
  record.checkmate = isMate || undefined;
  state.history.push(record);

  const key = positionKey(state);
  state.repetition[key] = (state.repetition[key] ?? 0) + 1;

  if (isMate) {
    finish(state, playerFor(state, color), 'checkmate');
  } else if (!opponentHasMoves) {
    finish(state, null, 'stalemate');
  } else if (state.halfmoveClock >= 100) {
    finish(state, null, 'fifty-move');
  } else if (state.repetition[key] >= 3) {
    finish(state, null, 'threefold');
  } else if (insufficientMaterial(state.board)) {
    finish(state, null, 'insufficient-material');
  }

  return record;
}

function finish(
  state: ChessState,
  winnerId: string | null,
  reason: ChessEndReason,
) {
  state.phase = 'done';
  state.winnerId = winnerId;
  state.endReason = reason;
}

/** Leaving mid-game hands the win to the other player. */
export function chessForfeit(state: ChessState, userId: string): void {
  if (state.phase === 'done') return;
  const color = colorOf(state, userId);
  if (!color) return;
  finish(state, playerFor(state, other(color)), 'forfeit');
}

export function chessPublicState(
  state: ChessState,
  viewer?: string,
): ChessPublicState {
  const yourColor = viewer ? colorOf(state, viewer) : null;
  const captured: { w: ChessPieceType[]; b: ChessPieceType[] } = { w: [], b: [] };
  for (const record of state.history) {
    // Recorded against the capturing side, so each tray shows what that
    // player has taken off the board.
    if (record.captured) captured[record.color].push(record.captured);
  }
  return {
    playerIds: state.playerIds,
    board: state.board,
    turn: state.turn,
    yourColor,
    legalMoves:
      yourColor && yourColor === state.turn && state.phase === 'play'
        ? legalMoves(state, yourColor)
        : [],
    inCheck: state.phase === 'play' && isInCheck(state, state.turn),
    phase: state.phase,
    winnerId: state.winnerId,
    endReason: state.endReason,
    lastMove: state.history[state.history.length - 1] ?? null,
    history: state.history,
    halfmoveClock: state.halfmoveClock,
    fullmove: state.fullmove,
    captured,
  };
}
