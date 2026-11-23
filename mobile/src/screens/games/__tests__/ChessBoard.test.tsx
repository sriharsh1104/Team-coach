import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ChessBoard } from '../ChessBoard';
import {
  ChessPiece,
  ChessPublicState,
  RoomView,
  chessSquareToIndex,
} from '../../../api/games';
import { ThemeProvider } from '../../../theme/ThemeContext';

function board(pieces: Record<string, string>): (ChessPiece | null)[] {
  const squares: (ChessPiece | null)[] = Array(64).fill(null);
  for (const [square, code] of Object.entries(pieces)) {
    squares[chessSquareToIndex(square)] = {
      color: code[0] as 'w',
      type: code[1] as 'p',
    };
  }
  return squares;
}

function room(over: Partial<ChessPublicState> = {}): RoomView {
  const chess: ChessPublicState = {
    playerIds: ['me', 'them'],
    board: board({ e1: 'wk', e8: 'bk', e2: 'wp' }),
    turn: 'w',
    yourColor: 'w',
    legalMoves: [
      { from: 'e2', to: 'e3' },
      { from: 'e2', to: 'e4' },
    ],
    inCheck: false,
    phase: 'play',
    winnerId: null,
    endReason: null,
    lastMove: null,
    history: [],
    halfmoveClock: 0,
    fullmove: 1,
    captured: { w: [], b: [] },
    ...over,
  };
  return { id: 'r1', chess } as unknown as RoomView;
}

function renderBoard(state: Partial<ChessPublicState>, onMove = jest.fn()) {
  render(
    <ThemeProvider>
      <ChessBoard room={room(state)} meId="me" busy={false} onMove={onMove} />
    </ThemeProvider>,
  );
  return onMove;
}

/** Squares carry an accessibility label of "e2, white p" / "e3, empty". */
const cell = (square: string) =>
  screen.getByLabelText(new RegExp(`^${square},`));

describe('ChessBoard', () => {
  it('draws all 64 squares and the pieces on them', () => {
    renderBoard({});
    expect(cell('e1')).toBeTruthy();
    expect(screen.getByLabelText('e2, white p')).toBeTruthy();
    expect(screen.getByLabelText('e8, black k')).toBeTruthy();
    expect(screen.getByLabelText('a4, empty')).toBeTruthy();
  });

  it('sends the move when you tap a piece and then a legal square', () => {
    const onMove = renderBoard({});
    fireEvent.press(cell('e2'));
    fireEvent.press(cell('e4'));
    expect(onMove).toHaveBeenCalledWith('e2', 'e4');
  });

  it('ignores a square the selected piece cannot reach', () => {
    const onMove = renderBoard({});
    fireEvent.press(cell('e2'));
    fireEvent.press(cell('h5'));
    expect(onMove).not.toHaveBeenCalled();
  });

  it('does nothing at all when it is not your turn', () => {
    // The server sends no legal moves to the side that is not to move, so
    // there is nothing to select in the first place.
    const onMove = renderBoard({ turn: 'b', legalMoves: [] });
    fireEvent.press(cell('e2'));
    fireEvent.press(cell('e4'));
    expect(onMove).not.toHaveBeenCalled();
    expect(screen.getByText('Waiting for their move')).toBeTruthy();
  });

  /**
   * Four legal moves share one target square when a pawn promotes, so the
   * board has to ask instead of guessing a queen.
   */
  it('asks which piece to promote to, then sends that choice', () => {
    const onMove = renderBoard({
      board: board({ e1: 'wk', e8: 'bk', a7: 'wp' }),
      legalMoves: [
        { from: 'a7', to: 'a8', promotion: 'q' },
        { from: 'a7', to: 'a8', promotion: 'r' },
        { from: 'a7', to: 'a8', promotion: 'b' },
        { from: 'a7', to: 'a8', promotion: 'n' },
      ],
    });

    fireEvent.press(cell('a7'));
    fireEvent.press(cell('a8'));
    // Nothing sent yet — the choice is still open.
    expect(onMove).not.toHaveBeenCalled();
    expect(screen.getByText('Promote to')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Promote to Knight'));
    expect(onMove).toHaveBeenCalledWith('a7', 'a8', 'n');
  });

  it('calls out check, and the result once the game ends', () => {
    renderBoard({ inCheck: true });
    expect(screen.getByText('You are in check')).toBeTruthy();

    screen.unmount();
    renderBoard({
      phase: 'done',
      winnerId: 'me',
      endReason: 'checkmate',
      legalMoves: [],
    });
    expect(screen.getByText(/You won — Checkmate/)).toBeTruthy();
  });

  it('names a draw as a draw rather than a loss', () => {
    renderBoard({
      phase: 'done',
      winnerId: null,
      endReason: 'stalemate',
      legalMoves: [],
    });
    expect(screen.getByText('Stalemate — draw')).toBeTruthy();
  });
});
