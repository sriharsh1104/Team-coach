import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PlayerStatsScreen } from '../PlayerStatsScreen';
import * as statsApi from '../../../api/stats';

jest.mock('../../../api/stats');

const mockedStatsApi = statsApi as jest.Mocked<typeof statsApi>;
const navigation = {} as any;
const route = { params: { userId: 'user-1', name: 'Player One' } } as any;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PlayerStatsScreen', () => {
  it('shows a loading indicator before data arrives', () => {
    mockedStatsApi.getPlayerStats.mockReturnValue(new Promise(() => {}));
    render(<PlayerStatsScreen navigation={navigation} route={route} />);

    expect(screen.queryByText('Player One')).toBeNull();
  });

  it('shows totals, computed K/D, match count, and entries once loaded', async () => {
    mockedStatsApi.getPlayerStats.mockResolvedValue({
      totals: { kills: 40, deaths: 20, assists: 10 },
      matches: 8,
      entries: [
        { id: 'e1', recordedAt: '2026-01-05T00:00:00.000Z', kills: 10, deaths: 5, assists: 2 },
      ],
    } as any);
    render(<PlayerStatsScreen navigation={navigation} route={route} />);

    await screen.findByText('Player One');
    expect(screen.getByText('40')).toBeTruthy();
    expect(screen.getByText('20')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.getByText('2.00')).toBeTruthy();
    expect(screen.getByText('8 match(es) recorded')).toBeTruthy();
    expect(screen.getByText('10K / 5D / 2A')).toBeTruthy();
  });

  it('shows raw kills for K/D instead of dividing by zero deaths', async () => {
    mockedStatsApi.getPlayerStats.mockResolvedValue({
      totals: { kills: 6, deaths: 0, assists: 1 },
      matches: 2,
      entries: [],
    } as any);
    render(<PlayerStatsScreen navigation={navigation} route={route} />);

    await screen.findByText('Player One');
    // The K/D card falls back to the raw kill count, so "6" legitimately
    // appears twice: once as the Kills total, once as K/D.
    expect(screen.getAllByText('6')).toHaveLength(2);
  });

  it('shows the empty-entries message when there are no confirmed stat entries', async () => {
    mockedStatsApi.getPlayerStats.mockResolvedValue({
      totals: { kills: 0, deaths: 0, assists: 0 },
      matches: 0,
      entries: [],
    } as any);
    render(<PlayerStatsScreen navigation={navigation} route={route} />);

    await screen.findByText('No confirmed stats yet.');
  });

  it('reloads when userId changes', async () => {
    mockedStatsApi.getPlayerStats.mockResolvedValue({
      totals: { kills: 1, deaths: 1, assists: 1 },
      matches: 1,
      entries: [],
    } as any);
    const { rerender } = render(<PlayerStatsScreen navigation={navigation} route={route} />);
    await screen.findByText('Player One');

    rerender(
      <PlayerStatsScreen
        navigation={navigation}
        route={{ params: { userId: 'user-2', name: 'Player Two' } } as any}
      />,
    );

    await screen.findByText('Player Two');
    expect(mockedStatsApi.getPlayerStats).toHaveBeenCalledWith('user-2');
  });
});
