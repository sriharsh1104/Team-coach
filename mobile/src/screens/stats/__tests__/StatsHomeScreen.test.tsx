import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { StatsHomeScreen } from '../StatsHomeScreen';
import * as statsApi from '../../../api/stats';

jest.mock('../../../api/stats');
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, []),
}));

const mockedStatsApi = statsApi as jest.Mocked<typeof statsApi>;
const navigation = { navigate: jest.fn() } as any;

const pendingExtraction = {
  id: 'ext-1',
  status: 'PENDING',
  rows: [
    { rawName: 'Player A', matchedUserId: null, kills: 1, deaths: 2, assists: 3 },
    { rawName: 'Player B', matchedUserId: null, kills: 0, deaths: 0, assists: 0 },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  reviewedAt: null,
  mediaPostId: 'post-1',
} as any;

const confirmedExtraction = { ...pendingExtraction, id: 'ext-2', status: 'CONFIRMED' };

beforeEach(() => {
  jest.clearAllMocks();
  mockedStatsApi.getLeaderboard.mockResolvedValue([]);
  mockedStatsApi.listExtractions.mockResolvedValue([]);
});

describe('StatsHomeScreen', () => {
  it('shows the empty leaderboard message and no pending section when there is nothing to show', async () => {
    render(<StatsHomeScreen navigation={navigation} route={{} as any} />);

    await screen.findByText(/No confirmed stats yet/);
    expect(screen.queryByText('Pending Review')).toBeNull();
  });

  it('shows only PENDING extractions under Pending Review, not confirmed ones', async () => {
    mockedStatsApi.listExtractions.mockResolvedValue([pendingExtraction, confirmedExtraction]);
    render(<StatsHomeScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('Pending Review');
    const expectedTimestamp = new Date(pendingExtraction.createdAt).toLocaleString();
    expect(screen.getByText(`2 player(s) · ${expectedTimestamp}`)).toBeTruthy();
    expect(screen.getAllByText('Review →')).toHaveLength(1);
  });

  it('navigates to ExtractionReview with the extraction when a pending row is pressed', async () => {
    mockedStatsApi.listExtractions.mockResolvedValue([pendingExtraction]);
    render(<StatsHomeScreen navigation={navigation} route={{} as any} />);

    const row = await screen.findByText('Review →');
    fireEvent.press(row);

    expect(navigation.navigate).toHaveBeenCalledWith('ExtractionReview', {
      extraction: pendingExtraction,
    });
  });

  it('renders leaderboard rows with rank and computed K/D', async () => {
    mockedStatsApi.getLeaderboard.mockResolvedValue([
      { userId: 'user-1', name: 'Top Frag', kills: 20, deaths: 10, assists: 5, matches: 4 },
      { userId: 'user-2', name: 'Support', kills: 4, deaths: 0, assists: 12, matches: 4 },
    ]);
    render(<StatsHomeScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('Top Frag');
    expect(screen.getByText('#1')).toBeTruthy();
    expect(screen.getByText('4 match(es) · K/D 2.00')).toBeTruthy();
    expect(screen.getByText('20K / 10D / 5A')).toBeTruthy();

    // Support has 0 deaths: K/D falls back to raw kills, not a division-by-zero NaN.
    expect(screen.getByText('#2')).toBeTruthy();
    expect(screen.getByText('4 match(es) · K/D 4')).toBeTruthy();
  });

  it('navigates to PlayerStats when a leaderboard row is pressed', async () => {
    mockedStatsApi.getLeaderboard.mockResolvedValue([
      { userId: 'user-1', name: 'Top Frag', kills: 20, deaths: 10, assists: 5, matches: 4 },
    ]);
    render(<StatsHomeScreen navigation={navigation} route={{} as any} />);

    const row = await screen.findByText('Top Frag');
    fireEvent.press(row);

    await waitFor(() =>
      expect(navigation.navigate).toHaveBeenCalledWith('PlayerStats', {
        userId: 'user-1',
        name: 'Top Frag',
      }),
    );
  });
});
