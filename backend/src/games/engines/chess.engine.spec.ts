import {
  ChessMove,
  ChessState,
  chessForfeit,
  chessMove,
  chessPublicState,
  createChessState,
  indexToSquare,
  isSquareAttacked,
  legalMoves,
  positionKey,
  squareToIndex,
} from './chess.engine';

const P: [string, string] = ['white', 'black'];

function play(state: ChessState, ...moves: string[]) {
  for (const text of moves) {
    const [from, to, promotion] = [
      text.slice(0, 2),
      text.slice(2, 4),
      text.slice(4, 5),
    ];
    const mover = state.turn === 'w' ? P[0] : P[1];
    chessMove(state, mover, {
      from,
      to,
      ...(promotion ? { promotion: promotion as 'q' } : {}),
    } as ChessMove);
  }
}

/** Build a sparse position; everything not listed is empty. */
function position(
  pieces: Record<string, string>,
  turn: 'w' | 'b' = 'w',
): ChessState {
  const state = createChessState(P);
  state.board = Array(64).fill(null);
  for (const [square, code] of Object.entries(pieces)) {
    state.board[squareToIndex(square)] = {
      color: code[0] as 'w' | 'b',
      type: code[1] as 'p',
    };
  }
  state.turn = turn;
  state.castling = {
    w: { king: false, queen: false },
    b: { king: false, queen: false },
  };
  state.enPassant = null;
  // createChessState seeded the opening position; this board replaced it.
  state.repetition = { [positionKey(state)]: 1 };
  return state;
}

const squares = (moves: ChessMove[], from: string) =>
  moves
    .filter((m) => m.from === from)
    .map((m) => m.to)
    .sort();

describe('chess board geometry', () => {
  it('maps squares to indices with a8 top-left and h1 bottom-right', () => {
    expect(squareToIndex('a8')).toBe(0);
    expect(squareToIndex('h8')).toBe(7);
    expect(squareToIndex('a1')).toBe(56);
    expect(squareToIndex('h1')).toBe(63);
    expect(indexToSquare(0)).toBe('a8');
    expect(indexToSquare(63)).toBe('h1');
  });

  // The classic off-by-one in flat boards: a rook on h-file "wrapping" to the
  // a-file of the next rank.
  it('never lets a sliding piece wrap around the edge of the board', () => {
    const state = position({ h4: 'wr', e1: 'wk', e8: 'bk' });
    expect(squares(legalMoves(state, 'w'), 'h4')).not.toContain('a5');
    expect(squares(legalMoves(state, 'w'), 'h4')).toContain('h8');
  });
});

describe('opening position', () => {
  it('gives White exactly 20 legal first moves', () => {
    const state = createChessState(P);
    expect(legalMoves(state, 'w')).toHaveLength(20);
  });

  it('lets a pawn step one or two squares from home, one square after that', () => {
    const state = createChessState(P);
    expect(squares(legalMoves(state, 'w'), 'e2')).toEqual(['e3', 'e4']);
    play(state, 'e2e4', 'e7e5');
    expect(squares(legalMoves(state, 'w'), 'e4')).toEqual([]);
  });

  it('refuses to move out of turn or move the opponent’s piece', () => {
    const state = createChessState(P);
    expect(() => chessMove(state, P[1], { from: 'e7', to: 'e5' })).toThrow(
      /Not your turn/,
    );
    expect(() => chessMove(state, P[0], { from: 'e7', to: 'e5' })).toThrow(
      /Illegal move/,
    );
  });
});

describe('piece movement', () => {
  it('moves a knight in its L and lets it jump over pieces', () => {
    const state = createChessState(P);
    expect(squares(legalMoves(state, 'w'), 'g1')).toEqual(['f3', 'h3']);
  });

  it('blocks a sliding piece on the first occupied square but allows the capture', () => {
    const state = position({ a1: 'wr', a4: 'bp', a5: 'bp', e1: 'wk', e8: 'bk' });
    // Up the file it stops on the pawn it can take; along the rank it runs
    // until the king blocks it.
    expect(squares(legalMoves(state, 'w'), 'a1')).toEqual([
      'a2',
      'a3',
      'a4',
      'b1',
      'c1',
      'd1',
    ]);
  });

  it('will not let a piece capture its own side', () => {
    const state = position({ a1: 'wr', a4: 'wp', e1: 'wk', e8: 'bk' });
    expect(squares(legalMoves(state, 'w'), 'a1')).toEqual([
      'a2',
      'a3',
      'b1',
      'c1',
      'd1',
    ]);
  });
});

describe('check', () => {
  it('reports a square attacked by a pawn in the right direction only', () => {
    const state = position({ e4: 'wp', e1: 'wk', e8: 'bk' });
    expect(isSquareAttacked(state.board, squareToIndex('d5'), 'w')).toBe(true);
    expect(isSquareAttacked(state.board, squareToIndex('f5'), 'w')).toBe(true);
    // A white pawn does not attack backwards.
    expect(isSquareAttacked(state.board, squareToIndex('d3'), 'w')).toBe(false);
  });

  it('forces the side in check to answer it', () => {
    const state = position({ e1: 'wk', e8: 'bk', h4: 'bq' }, 'w');
    // Every legal move must leave White out of check.
    for (const move of legalMoves(state, 'w')) {
      expect(move.from).toBe('e1');
    }
    expect(legalMoves(state, 'w').length).toBeGreaterThan(0);
  });

  it('will not let a pinned piece abandon the king', () => {
    const state = position({ e1: 'wk', e2: 'wr', e8: 'bq', a1: 'wq' }, 'w');
    // The rook is pinned down the e-file: it may only move along it.
    expect(squares(legalMoves(state, 'w'), 'e2')).toEqual([
      'e3',
      'e4',
      'e5',
      'e6',
      'e7',
      'e8',
    ]);
  });

  it('will not let the king step onto an attacked square', () => {
    const state = position({ e1: 'wk', a2: 'br', e8: 'bk' }, 'w');
    expect(squares(legalMoves(state, 'w'), 'e1')).not.toContain('d2');
    expect(squares(legalMoves(state, 'w'), 'e1')).not.toContain('e2');
  });
});

describe('castling', () => {
  function castlingSetup(extra: Record<string, string> = {}) {
    const state = position({ e1: 'wk', a1: 'wr', h1: 'wr', e8: 'bk', ...extra });
    state.castling.w = { king: true, queen: true };
    return state;
  }

  it('offers both sides when the path is clear', () => {
    const state = castlingSetup();
    expect(squares(legalMoves(state, 'w'), 'e1')).toEqual(
      expect.arrayContaining(['g1', 'c1']),
    );
  });

  it('moves the rook across with the king', () => {
    const state = castlingSetup();
    chessMove(state, P[0], { from: 'e1', to: 'g1' });
    expect(state.board[squareToIndex('g1')]?.type).toBe('k');
    expect(state.board[squareToIndex('f1')]?.type).toBe('r');
    expect(state.board[squareToIndex('h1')]).toBeNull();
    expect(state.history[0].san).toBe('O-O');
  });

  it('refuses while in check, through check, or into check', () => {
    expect(squares(legalMoves(castlingSetup({ e5: 'br' }), 'w'), 'e1')).not.toContain('g1');
    expect(squares(legalMoves(castlingSetup({ f5: 'br' }), 'w'), 'e1')).not.toContain('g1');
    expect(squares(legalMoves(castlingSetup({ g5: 'br' }), 'w'), 'e1')).not.toContain('g1');
  });

  // The queen's rook passes b1, which may be attacked — that is still legal.
  it('allows queenside castling even when the rook’s path is attacked', () => {
    const state = castlingSetup({ b5: 'br' });
    expect(squares(legalMoves(state, 'w'), 'e1')).toContain('c1');
  });

  it('is blocked by a piece in the way', () => {
    const state = castlingSetup({ f1: 'wn' });
    expect(squares(legalMoves(state, 'w'), 'e1')).not.toContain('g1');
  });

  it('is lost for good once the king moves', () => {
    const state = castlingSetup();
    chessMove(state, P[0], { from: 'e1', to: 'e2' });
    expect(state.castling.w).toEqual({ king: false, queen: false });
  });

  it('is lost on one side when that rook moves, and when it is captured', () => {
    const moved = castlingSetup();
    // h1 is the king's rook, so it is kingside that is lost.
    chessMove(moved, P[0], { from: 'h1', to: 'h2' });
    expect(moved.castling.w).toEqual({ king: false, queen: true });

    const taken = castlingSetup({ h8: 'br' });
    taken.turn = 'b';
    chessMove(taken, P[1], { from: 'h8', to: 'h1' });
    expect(taken.castling.w.king).toBe(false);
  });
});

describe('en passant', () => {
  it('is offered only on the move right after a double step, and removes the passed pawn', () => {
    const state = createChessState(P);
    play(state, 'e2e4', 'a7a6', 'e4e5', 'd7d5');
    expect(state.enPassant).toBe('d6');
    expect(squares(legalMoves(state, 'w'), 'e5')).toContain('d6');

    chessMove(state, P[0], { from: 'e5', to: 'd6' });
    expect(state.board[squareToIndex('d6')]?.type).toBe('p');
    // The captured pawn stood on d5, not on the square we moved to.
    expect(state.board[squareToIndex('d5')]).toBeNull();
    expect(state.history.at(-1)?.enPassant).toBe(true);
  });

  it('expires if not taken immediately', () => {
    const state = createChessState(P);
    play(state, 'e2e4', 'a7a6', 'e4e5', 'd7d5', 'a2a3', 'h7h6');
    expect(state.enPassant).toBeNull();
    expect(squares(legalMoves(state, 'w'), 'e5')).not.toContain('d6');
  });
});

describe('promotion', () => {
  it('offers all four pieces and nothing else', () => {
    const state = position({ a7: 'wp', e1: 'wk', e8: 'bk' }, 'w');
    const promotions = legalMoves(state, 'w')
      .filter((m) => m.from === 'a7' && m.to === 'a8')
      .map((m) => m.promotion)
      .sort();
    expect(promotions).toEqual(['b', 'n', 'q', 'r']);
  });

  it('places the chosen piece and writes it into the notation', () => {
    const state = position({ a7: 'wp', e1: 'wk', h8: 'bk' }, 'w');
    chessMove(state, P[0], { from: 'a7', to: 'a8', promotion: 'n' });
    expect(state.board[squareToIndex('a8')]).toEqual({ type: 'n', color: 'w' });
    expect(state.history[0].san).toContain('=N');
  });
});

describe('endings', () => {
  it('calls checkmate and hands the game to the mating side', () => {
    const state = createChessState(P);
    // Fool's mate.
    play(state, 'f2f3', 'e7e5', 'g2g4', 'd8h4');
    expect(state.phase).toBe('done');
    expect(state.winnerId).toBe(P[1]);
    expect(state.endReason).toBe('checkmate');
    expect(state.history.at(-1)?.san).toBe('Qh4#');
  });

  it('calls stalemate a draw, not a win', () => {
    // Qg6 leaves Black's king on h8 with g8 and h7 covered but h8 itself
    // untouched: no check, no move. (Qb7-style positions next to the king are
    // mate, not stalemate — the difference is exactly what this guards.)
    const state = position({ h8: 'bk', f7: 'wk', g5: 'wq' }, 'w');
    chessMove(state, P[0], { from: 'g5', to: 'g6' });
    expect(state.phase).toBe('done');
    expect(state.endReason).toBe('stalemate');
    expect(state.winnerId).toBeNull();
  });

  it('draws on insufficient material once the last pawn goes', () => {
    const state = position({ e1: 'wk', e8: 'bk', d4: 'wn', d5: 'bp' }, 'w');
    chessMove(state, P[0], { from: 'd4', to: 'b5' });
    expect(state.phase).toBe('play');
    chessMove(state, P[1], { from: 'd5', to: 'd4' });
    chessMove(state, P[0], { from: 'b5', to: 'd4' });
    expect(state.endReason).toBe('insufficient-material');
    expect(state.winnerId).toBeNull();
  });

  it('draws by the fifty-move rule, counting plies since a pawn or capture', () => {
    const state = position({ e1: 'wk', e8: 'bk', a1: 'wr', h8: 'br' }, 'w');
    state.halfmoveClock = 99;
    chessMove(state, P[0], { from: 'a1', to: 'a2' });
    expect(state.halfmoveClock).toBe(100);
    expect(state.endReason).toBe('fifty-move');
  });

  it('draws by threefold repetition', () => {
    const state = position({ e1: 'wk', e8: 'bk', a1: 'wr', h8: 'br' }, 'w');
    // Shuffle both rooks back and forth until the start position recurs twice.
    play(state, 'a1a2', 'h8h7', 'a2a1', 'h7h8');
    play(state, 'a1a2', 'h8h7', 'a2a1', 'h7h8');
    expect(state.endReason).toBe('threefold');
    expect(state.winnerId).toBeNull();
  });

  it('hands the win to the other player on forfeit', () => {
    const state = createChessState(P);
    chessForfeit(state, P[0]);
    expect(state.winnerId).toBe(P[1]);
    expect(state.endReason).toBe('forfeit');
  });

  it('refuses any move once the game is over', () => {
    const state = createChessState(P);
    chessForfeit(state, P[1]);
    expect(() => chessMove(state, P[0], { from: 'e2', to: 'e4' })).toThrow(
      /Game is over/,
    );
  });
});

describe('public state', () => {
  it('tells each player their colour and only gives the mover legal moves', () => {
    const state = createChessState(P);
    const forWhite = chessPublicState(state, P[0]);
    const forBlack = chessPublicState(state, P[1]);
    expect(forWhite.yourColor).toBe('w');
    expect(forBlack.yourColor).toBe('b');
    expect(forWhite.legalMoves).toHaveLength(20);
    // Not Black's turn — nothing to offer them yet.
    expect(forBlack.legalMoves).toHaveLength(0);
  });

  it('gives a watcher no colour and no moves', () => {
    const state = createChessState(P);
    const watcher = chessPublicState(state, 'someone-else');
    expect(watcher.yourColor).toBeNull();
    expect(watcher.legalMoves).toHaveLength(0);
    // The board itself is public — chess has no hidden information.
    expect(watcher.board).toHaveLength(64);
  });

  it('tracks captured pieces per side', () => {
    const state = createChessState(P);
    play(state, 'e2e4', 'd7d5', 'e4d5');
    expect(chessPublicState(state, P[0]).captured.w).toEqual(['p']);
  });

  it('flags check so the board can show it', () => {
    const state = position({ e1: 'wk', e8: 'bk', h5: 'wq' }, 'w');
    chessMove(state, P[0], { from: 'h5', to: 'e5' });
    expect(chessPublicState(state, P[1]).inCheck).toBe(true);
  });
});
