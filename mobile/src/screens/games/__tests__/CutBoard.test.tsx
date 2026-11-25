import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { CutBoard } from '../CutBoard';
import { CutPublicState, RoomView } from '../../../api/games';
import { ThemeProvider } from '../../../theme/ThemeContext';

function room(over: Partial<CutPublicState> = {}): RoomView {
  const cut: CutPublicState = {
    playerIds: ['me', 'them'],
    cut: { me: [], them: [] },
    turnIndex: 0,
    turnId: 'me',
    phase: 'play',
    lastDraw: null,
    lastDrawBy: null,
    lastWasRepeat: false,
    winnerId: null,
    lastEvent: null,
    version: 1,
    ...over,
  };
  return {
    id: 'r1',
    cut,
    players: [
      { userId: 'me', name: 'Rhea', avatarUrl: null, seat: 0, connected: true },
      { userId: 'them', name: 'Vik', avatarUrl: null, seat: 1, connected: true },
    ],
  } as unknown as RoomView;
}

function renderBoard(over: Partial<CutPublicState> = {}, busy = false) {
  const onDraw = jest.fn();
  render(
    <ThemeProvider>
      <CutBoard room={room(over)} meId="me" busy={busy} onDraw={onDraw} />
    </ThemeProvider>,
  );
  return onDraw;
}

describe('CutBoard', () => {
  it('shows a 1-9 box for every player', () => {
    renderBoard();
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      expect(screen.getByLabelText(`Rhea ${n}`)).toBeTruthy();
      expect(screen.getByLabelText(`Vik ${n}`)).toBeTruthy();
    }
  });

  it('marks only the numbers that player has actually cut', () => {
    renderBoard({ cut: { me: [3, 7], them: [1] } });
    expect(screen.getByLabelText('Rhea 3, cut')).toBeTruthy();
    expect(screen.getByLabelText('Rhea 7, cut')).toBeTruthy();
    // Someone else cutting 1 must not cross it off my board.
    expect(screen.getByLabelText('Rhea 1')).toBeTruthy();
    expect(screen.getByLabelText('Vik 1, cut')).toBeTruthy();
  });

  it('draws on your turn and says the card is still yours after a hit', () => {
    const onDraw = renderBoard({
      lastDraw: 4,
      lastDrawBy: 'me',
      lastWasRepeat: false,
      cut: { me: [4], them: [] },
    });
    expect(screen.getByText('Your turn — draw the card')).toBeTruthy();
    expect(screen.getByLabelText('Card showing 4')).toBeTruthy();
    expect(screen.getByText('Cut! Draw again')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Draw a number'));
    expect(onDraw).toHaveBeenCalled();
  });

  it('will not draw when the card is with someone else', () => {
    const onDraw = renderBoard({
      turnId: 'them',
      lastDraw: 6,
      lastDrawBy: 'me',
      lastWasRepeat: true,
      cut: { me: [6], them: [] },
    });
    expect(screen.getByText("Vik's turn")).toBeTruthy();
    expect(screen.getByText('Already cut — turn passed')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Draw a number'));
    expect(onDraw).not.toHaveBeenCalled();
  });

  it('will not draw while a move is in flight, or for a spectator', () => {
    const onDraw = renderBoard({}, true);
    fireEvent.press(screen.getByLabelText('Draw a number'));
    expect(onDraw).not.toHaveBeenCalled();
  });

  it('calls the winner once a board is cleared', () => {
    renderBoard({
      phase: 'done',
      winnerId: 'them',
      cut: { me: [1, 2], them: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    });
    expect(screen.getByText('Vik cleared their board first')).toBeTruthy();
    expect(screen.getByText('9/9')).toBeTruthy();
  });
});
