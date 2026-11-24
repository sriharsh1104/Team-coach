import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import {
  REACTION_EMOJI,
  ReactionBar,
  ReactionOverlay,
  useGameReactions,
} from '../GameReactions';
import { GAME_REACTIONS, GameReaction } from '../../../api/games';
import { ThemeProvider } from '../../../theme/ThemeContext';

/** Drives the hook the way GameRoomScreen does, so the two stay in step. */
function Harness({ send }: { send?: (r: GameReaction) => void }) {
  const { floaters, show } = useGameReactions();
  return (
    <ThemeProvider>
      <ReactionBar
        onSend={(reaction) => {
          show(reaction, true);
          send?.(reaction);
        }}
      />
      <ReactionOverlay floaters={floaters} />
    </ThemeProvider>
  );
}

describe('game reactions', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('offers exactly the four reactions the server accepts', () => {
    render(<Harness />);
    for (const reaction of GAME_REACTIONS) {
      // Every reaction the server will accept has a button and a glyph.
      expect(REACTION_EMOJI[reaction]).toBeTruthy();
    }
    // One button per reaction, no more — the set is closed on both sides.
    expect(screen.getAllByLabelText(/Send .* reaction/)).toHaveLength(
      GAME_REACTIONS.length,
    );
    expect(screen.getByLabelText('Send Angry reaction')).toBeTruthy();
    expect(screen.getByLabelText('Send Cool reaction')).toBeTruthy();
  });

  it('sends the tapped reaction and floats it on screen', () => {
    const send = jest.fn();
    render(<Harness send={send} />);

    fireEvent.press(screen.getByLabelText('Send Laughing reaction'));
    expect(send).toHaveBeenCalledWith('laughing');
    const floaters = screen.getAllByTestId('reaction-floater', {
      includeHiddenElements: true,
    });
    expect(floaters).toHaveLength(1);
    expect(floaters[0].props.children).toBe(REACTION_EMOJI.laughing);
  });

  it('clears the emoji again so they do not pile up on the board', () => {
    render(<Harness />);
    fireEvent.press(screen.getByLabelText('Send Angry reaction'));
    expect(
      screen.getAllByTestId('reaction-floater', { includeHiddenElements: true }),
    ).toHaveLength(1);

    act(() => {
      jest.advanceTimersByTime(2500);
    });
    expect(
      screen.queryAllByTestId('reaction-floater', {
        includeHiddenElements: true,
      }),
    ).toHaveLength(0);
  });

  it('caps how many sit on screen at once when someone spams', () => {
    render(<Harness />);
    const button = screen.getByLabelText('Send Cool reaction');
    for (let i = 0; i < 12; i++) fireEvent.press(button);

    // Older ones are dropped rather than stacking up indefinitely.
    expect(
      screen.getAllByTestId('reaction-floater', { includeHiddenElements: true })
        .length,
    ).toBeLessThanOrEqual(6);
  });

  it('does not block taps on the board underneath', () => {
    render(<Harness />);
    fireEvent.press(screen.getByLabelText('Send Cool reaction'));
    // The overlay must stay transparent to touches — a drifting emoji
    // swallowing a shot would be worse than having no reactions at all.
    const overlay = screen.getByTestId('reaction-overlay', {
      includeHiddenElements: true,
    });
    expect(overlay.props.pointerEvents).toBe('none');
  });
});
