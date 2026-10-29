import React from 'react';
import { FlatList } from 'react-native';
import { render, screen, act } from '@testing-library/react-native';
import { PlayerStatsScreen } from '../PlayerStatsScreen';
import * as statsApi from '../../../api/stats';

jest.mock('../../../api/stats');

const mockedStatsApi = statsApi as jest.Mocked<typeof statsApi>;
const navigation = {} as any;
const route = { params: { userId: 'user-1', name: 'Player One', mode: 'BR' } } as any;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PlayerStatsScreen', () => {
  it('shows a loading indicator before data arrives', () => {
    mockedStatsApi.getPlayerStats.mockReturnValue(new Promise(() => {}));
    render(<PlayerStatsScreen navigation={navigation} route={route} />);

    expect(screen.queryByText('Player One')).toBeNull();
  });

  it('shows totals (including damage) and day-grouped K/A/damage history once loaded', async () => {
    mockedStatsApi.getPlayerStats.mockResolvedValue({
      mode: 'BR',
      totals: { kills: 40, deaths: 20, assists: 10, damage: 5000 },
      matches: 8,
      entries: [
        {
          id: 'e1',
          recordedAt: '2026-01-05T15:30:00.000Z',
          kills: 10,
          deaths: 5,
          assists: 2,
          damage: 900,
        },
      ],
      nextCursor: null,
    } as any);
    render(<PlayerStatsScreen navigation={navigation} route={route} />);

    await screen.findByText('Player One');
    expect(screen.getByText('BR · Day History')).toBeTruthy();
    expect(screen.getByText('40')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.getByText('5000')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
    expect(screen.getByText('10K / 2A / 900 DMG')).toBeTruthy();
  });

  it('shows the empty-entries message when there are no confirmed stat entries', async () => {
    mockedStatsApi.getPlayerStats.mockResolvedValue({
      mode: 'BR',
      totals: { kills: 0, deaths: 0, assists: 0, damage: 0 },
      matches: 0,
      entries: [],
      nextCursor: null,
    } as any);
    render(<PlayerStatsScreen navigation={navigation} route={route} />);

    await screen.findByText('No confirmed BR stats yet.');
  });

  it('reloads when userId or mode changes', async () => {
    mockedStatsApi.getPlayerStats.mockResolvedValue({
      mode: 'BR',
      totals: { kills: 1, deaths: 1, assists: 1, damage: 100 },
      matches: 1,
      entries: [],
      nextCursor: null,
    } as any);
    const { rerender } = render(<PlayerStatsScreen navigation={navigation} route={route} />);
    await screen.findByText('Player One');

    rerender(
      <PlayerStatsScreen
        navigation={navigation}
        route={{ params: { userId: 'user-2', name: 'Player Two', mode: 'CS' } } as any}
      />,
    );

    await screen.findByText('Player Two');
    expect(mockedStatsApi.getPlayerStats).toHaveBeenCalledWith('user-2', 'CS');
  });

  it('loads the next page via nextCursor and appends it to the existing entries', async () => {
    mockedStatsApi.getPlayerStats.mockResolvedValueOnce({
      mode: 'BR',
      totals: { kills: 20, deaths: 10, assists: 4, damage: 1000 },
      matches: 2,
      entries: [
        { id: 'e1', recordedAt: '2026-01-05T15:30:00.000Z', kills: 10, deaths: 5, assists: 2, damage: 500 },
      ],
      nextCursor: 'e1',
    } as any);
    render(<PlayerStatsScreen navigation={navigation} route={route} />);
    await screen.findByText('Player One');

    mockedStatsApi.getPlayerStats.mockResolvedValueOnce({
      mode: 'BR',
      totals: { kills: 20, deaths: 10, assists: 4, damage: 1000 },
      matches: 2,
      entries: [
        { id: 'e2', recordedAt: '2026-01-04T15:30:00.000Z', kills: 10, deaths: 5, assists: 2, damage: 500 },
      ],
      nextCursor: null,
    } as any);
    const list = screen.UNSAFE_getByType(FlatList);
    await act(async () => {
      list.props.onEndReached();
    });

    expect(mockedStatsApi.getPlayerStats).toHaveBeenLastCalledWith('user-1', 'BR', { cursor: 'e1' });
    expect(screen.getByText('Mon, Jan 5, 2026')).toBeTruthy();
    expect(screen.getByText('Sun, Jan 4, 2026')).toBeTruthy();
  });
});
