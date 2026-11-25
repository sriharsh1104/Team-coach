import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { UnoBoard } from '../UnoBoard';
import { RoomView, UnoCard, UnoPublicState } from '../../../api/games';
import { ThemeProvider } from '../../../theme/ThemeContext';

function card(
  color: UnoCard['color'],
  value: UnoCard['value'],
  id = `${color}-${value}`,
): UnoCard {
  return { id, color, value };
}

function room(over: Partial<UnoPublicState> = {}): RoomView {
  const uno: UnoPublicState = {
    playerIds: ['me', 'them'],
    hand: [card('red', '5'), card('blue', '9')],
    counts: { me: 2, them: 4 },
    topCard: card('red', '7', 'top'),
    activeColor: 'red',
    turnIndex: 0,
    turnId: 'me',
    direction: 1,
    drawPileCount: 62,
    discardCount: 3,
    phase: 'play',
    playable: ['red-5'],
    youDrew: false,
    drawnCardId: null,
    calledUno: { me: false, them: false },
    winnerId: null,
    endReason: null,
    lastEvent: 'Game on',
    version: 1,
    ...over,
  };
  return {
    id: 'r1',
    uno,
    players: [
      { userId: 'me', name: 'Me', avatarUrl: null, seat: 0, connected: true },
      { userId: 'them', name: 'Ria', avatarUrl: null, seat: 1, connected: true },
    ],
  } as unknown as RoomView;
}

type Handlers = {
  onPlay: jest.Mock;
  onDraw: jest.Mock;
  onPass: jest.Mock;
  onCall: jest.Mock;
};

function renderBoard(over: Partial<UnoPublicState> = {}): Handlers {
  const handlers: Handlers = {
    onPlay: jest.fn(),
    onDraw: jest.fn(),
    onPass: jest.fn(),
    onCall: jest.fn(),
  };
  render(
    <ThemeProvider>
      <UnoBoard room={room(over)} meId="me" busy={false} {...handlers} />
    </ThemeProvider>,
  );
  return handlers;
}

describe('UnoBoard', () => {
  it('shows the table: your hand, the opponent, the deck and the active colour', () => {
    renderBoard();
    expect(screen.getByLabelText('red 5, playable')).toBeTruthy();
    expect(screen.getByLabelText('blue 9')).toBeTruthy();
    expect(screen.getByText('Ria')).toBeTruthy();
    // Deck count badge and the colour everyone is matching.
    expect(screen.getByText('62')).toBeTruthy();
    expect(screen.getByText('RED')).toBeTruthy();
  });

  it('plays a card the server marked playable, and ignores one it did not', () => {
    const { onPlay } = renderBoard();
    fireEvent.press(screen.getByLabelText('blue 9'));
    expect(onPlay).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('red 5, playable'));
    expect(onPlay).toHaveBeenCalledWith('red-5');
  });

  it('asks for a colour before playing a wild', () => {
    const { onPlay } = renderBoard({
      hand: [card(null, 'wild', 'w1')],
      counts: { me: 1, them: 4 },
      playable: ['w1'],
    });

    fireEvent.press(screen.getByLabelText('wild W, playable'));
    // Nothing sent yet — the colour is still open.
    expect(onPlay).not.toHaveBeenCalled();
    expect(screen.getByText('Choose Active Color')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Choose green'));
    expect(onPlay).toHaveBeenCalledWith('w1', 'green');
  });

  it('draws from the deck, and offers the pass only once nothing will go', () => {
    const { onDraw } = renderBoard();
    expect(screen.queryByLabelText('Pass the turn')).toBeNull();
    fireEvent.press(screen.getByLabelText('Draw a card'));
    expect(onDraw).toHaveBeenCalled();

    screen.unmount();
    const { onPass } = renderBoard({ youDrew: true, playable: [] });
    fireEvent.press(screen.getByLabelText('Pass the turn'));
    expect(onPass).toHaveBeenCalled();
  });

  it('lets you shout UNO at two cards and not before', () => {
    const { onCall } = renderBoard();
    fireEvent.press(screen.getByLabelText('Shout UNO'));
    expect(onCall).toHaveBeenCalled();

    screen.unmount();
    const big = renderBoard({
      hand: [card('red', '5'), card('blue', '9'), card('green', '1')],
      counts: { me: 3, them: 4 },
    });
    fireEvent.press(screen.getByLabelText('Shout UNO'));
    expect(big.onCall).not.toHaveBeenCalled();
  });

  it('does nothing on someone else’s turn', () => {
    const { onPlay, onDraw } = renderBoard({ turnId: 'them', playable: [] });
    expect(screen.getByText("Ria's turn")).toBeTruthy();
    fireEvent.press(screen.getByLabelText('red 5'));
    fireEvent.press(screen.getByLabelText('Draw a card'));
    expect(onPlay).not.toHaveBeenCalled();
    expect(onDraw).not.toHaveBeenCalled();
  });

  it('names the winner when the round is over', () => {
    renderBoard({ phase: 'done', winnerId: 'them', endReason: 'empty-hand', playable: [] });
    expect(screen.getByText('Ria Won')).toBeTruthy();
    expect(screen.getByText('They emptied their hand first.')).toBeTruthy();
  });
});
