import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { GamesLeaderboardScreen } from '../GamesLeaderboardScreen';
import { useAuth } from '../../../auth/AuthContext';
import * as gameStats from '../../../api/gameStats';
import { emitToast } from '../../../ui/toastBus';

jest.mock('@react-navigation/native', () => {
  const ReactLib = require('react');
  return {
    useFocusEffect: (cb: () => (() => void) | void) => {
      ReactLib.useEffect(cb, []);
    },
  };
});
jest.mock('../../../auth/AuthContext');
jest.mock('../../../api/gameStats');
jest.mock('../../../ui/toastBus', () => ({ emitToast: jest.fn() }));

const mockedUseAuth = useAuth as jest.Mock;
const mockedStats = gameStats as jest.Mocked<typeof gameStats>;
const mockedToast = emitToast as jest.Mock;

const board: gameStats.GameLeaderboardRow[] = [
  { rank: 1, userId: 'me', name: 'Me', avatarUrl: null, played: 10, wins: 7, losses: 3, winRate: 0.7 },
  { rank: 2, userId: 'rival', name: 'Rival', avatarUrl: null, played: 8, wins: 4, losses: 4, winRate: 0.5 },
];

const myStats: gameStats.GamePlayerStats = {
  userId: 'me',
  name: 'Me',
  avatarUrl: null,
  totals: { played: 10, wins: 7, losses: 3, winRate: 0.7 },
  byGame: [
    { game: 'CHESS', played: 6, wins: 5, losses: 1, winRate: 0.833 },
    { game: 'UNO', played: 4, wins: 2, losses: 2, winRate: 0.5 },
  ],
  recent: [
    {
      id: 'm1',
      game: 'CHESS',
      playedAt: '2026-01-01T00:00:00.000Z',
      won: true,
      draw: false,
      endReason: 'checkmate',
      opponents: [{ userId: 'rival', name: 'Rival' }],
    },
    {
      id: 'm2',
      game: 'CHESS',
      playedAt: '2026-01-02T00:00:00.000Z',
      won: false,
      draw: true,
      endReason: 'stalemate',
      opponents: [{ userId: 'rival', name: 'Rival' }],
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseAuth.mockReturnValue({ user: { id: 'me', name: 'Me' } });
  mockedStats.getGameLeaderboard.mockResolvedValue(board);
  mockedStats.getMyGameStats.mockResolvedValue(myStats);
  mockedStats.getPlayerGameStats.mockResolvedValue({
    ...myStats,
    userId: 'rival',
    name: 'Rival',
  });
});

describe('GamesLeaderboardScreen', () => {
  it('shows the combined board and the caller’s own stats card', async () => {
    render(<GamesLeaderboardScreen />);

    await waitFor(() => expect(screen.getByText('Rival')).toBeTruthy());
    expect(screen.getByText('Your stats')).toBeTruthy();
    expect(screen.getByText(/10 played · 7 wins · 70% win rate/)).toBeTruthy();
    expect(screen.getByText('70%')).toBeTruthy(); // Me's row rate
    expect(screen.getByText('50%')).toBeTruthy(); // Rival's row rate
    expect(mockedStats.getGameLeaderboard).toHaveBeenCalledWith(undefined);
  });

  it('re-queries the board for one game when its chip is tapped', async () => {
    render(<GamesLeaderboardScreen />);
    await waitFor(() => expect(screen.getByText('Rival')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Show Chess leaderboard'));

    await waitFor(() =>
      expect(mockedStats.getGameLeaderboard).toHaveBeenLastCalledWith('chess'),
    );
  });

  it('opens a player’s breakdown and recent matches when their row is tapped', async () => {
    render(<GamesLeaderboardScreen />);
    await waitFor(() => expect(screen.getByText('Rival')).toBeTruthy());

    fireEvent.press(screen.getByLabelText("Rival's stats"));

    await waitFor(() => expect(mockedStats.getPlayerGameStats).toHaveBeenCalledWith('rival'));
    expect(await screen.findByText('By game')).toBeTruthy();
    expect(screen.getByText('Recent matches')).toBeTruthy();
    expect(screen.getByText('Won')).toBeTruthy();
    expect(screen.getByText('Draw')).toBeTruthy();
  });

  it('opens your own stats from the summary card without a second request', async () => {
    render(<GamesLeaderboardScreen />);
    await waitFor(() => expect(screen.getByText('Your stats')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Open your own stats'));

    await screen.findByText('By game');
    // Already have it from getMyGameStats — no round trip for your own card.
    expect(mockedStats.getPlayerGameStats).not.toHaveBeenCalled();
  });

  it('shows an empty state once nobody has a finished match yet', async () => {
    mockedStats.getGameLeaderboard.mockResolvedValue([]);
    render(<GamesLeaderboardScreen />);
    expect(
      await screen.findByText(/No games finished here yet/),
    ).toBeTruthy();
  });

  it('toasts rather than crashing when the leaderboard fails to load', async () => {
    mockedStats.getGameLeaderboard.mockRejectedValue(new Error('boom'));
    render(<GamesLeaderboardScreen />);
    await waitFor(() =>
      expect(mockedToast).toHaveBeenCalledWith('Could not load the leaderboard'),
    );
  });
});
