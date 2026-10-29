import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { StatsHomeScreen } from '../StatsHomeScreen';
import * as statsApi from '../../../api/stats';
import * as mediaApi from '../../../api/media';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../../auth/AuthContext';

jest.mock('../../../api/stats');
jest.mock('../../../api/media');
jest.mock('../../../auth/AuthContext');
jest.mock('../../scrims/MatchSchedulePanel', () => ({
  MatchSchedulePanel: ({ eventType }: { eventType: string }) => {
    const { Text } = require('react-native');
    return <Text>{`Match panel ${eventType}`}</Text>;
  },
}));
jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: { Images: 'Images' },
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, []),
}));

const mockedStatsApi = statsApi as jest.Mocked<typeof statsApi>;
const mockedMediaApi = mediaApi as jest.Mocked<typeof mediaApi>;
const mockedImagePicker = ImagePicker as jest.Mocked<typeof ImagePicker>;
const mockedUseAuth = useAuth as jest.Mock;
const navigation = { navigate: jest.fn() } as any;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockedStatsApi.getLeaderboard.mockResolvedValue([]);
  mockedStatsApi.listExtractions.mockResolvedValue([]);
  mockedStatsApi.getModeHistory.mockResolvedValue({ mode: 'BR', entries: [], nextCursor: null });
  // Coach/owner by default — matches most existing tests' assumption that
  // the viewer can act on pending extractions; non-reviewer behavior gets
  // its own dedicated tests below.
  mockedUseAuth.mockReturnValue({ org: { role: 'COACH', isOwner: false } });
});

describe('StatsHomeScreen', () => {
  it('shows four equal modes: BR, CS, Scrims, Tournament', async () => {
    render(<StatsHomeScreen navigation={navigation} route={{} as any} />);

    expect(screen.getByLabelText('BR')).toBeTruthy();
    expect(screen.getByLabelText('CS')).toBeTruthy();
    expect(screen.getByLabelText('Scrims')).toBeTruthy();
    expect(screen.getByLabelText('Tournament')).toBeTruthy();
    expect(screen.getByLabelText('Upload Scoreboard')).toBeTruthy();
    await screen.findByText(/No BR grind stats yet/);
  });

  it('opens Scrims schedule panel (not nested under BR) when Scrims is selected', async () => {
    render(<StatsHomeScreen navigation={navigation} route={{} as any} />);
    fireEvent.press(screen.getByLabelText('Scrims'));

    await screen.findByText('Match panel SCRIM');
    expect(screen.queryByLabelText('Upload Scoreboard')).toBeNull();
  });

  it('opens Tournament schedule panel when Tournament is selected', async () => {
    render(<StatsHomeScreen navigation={navigation} route={{} as any} />);
    fireEvent.press(screen.getByLabelText('Tournament'));

    await screen.findByText('Match panel TOURNAMENT');
  });

  it('navigates to PlayerStats from BR leaderboard, showing kills/assists/damage', async () => {
    mockedStatsApi.getLeaderboard.mockResolvedValue([
      { userId: 'user-1', name: 'Top Frag', kills: 20, deaths: 10, assists: 5, damage: 3000, matches: 4 },
    ]);
    render(<StatsHomeScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('20K / 5A / 3000 DMG');
    fireEvent.press(screen.getByText('Top Frag'));

    await waitFor(() =>
      expect(navigation.navigate).toHaveBeenCalledWith('PlayerStats', {
        userId: 'user-1',
        name: 'Top Frag',
        mode: 'BR',
      }),
    );
  });

  it('uploads multiple screenshots as one batch request, not one call per file', async () => {
    mockedImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true } as any);
    mockedImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file://a.jpg', fileName: 'a.jpg', mimeType: 'image/jpeg' },
        { uri: 'file://b.jpg', fileName: 'b.jpg', mimeType: 'image/jpeg' },
      ],
    } as any);
    mockedMediaApi.uploadMedia
      .mockResolvedValueOnce({ id: 'media-1' } as any)
      .mockResolvedValueOnce({ id: 'media-2' } as any);
    mockedStatsApi.requestExtractions.mockResolvedValue({
      created: [
        { id: 'ext-1', status: 'QUEUED' } as any,
        { id: 'ext-2', status: 'QUEUED' } as any,
      ],
      skipped: [],
    });

    render(<StatsHomeScreen navigation={navigation} route={{} as any} />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Upload Scoreboard'));
    });

    expect(mockedStatsApi.requestExtractions).toHaveBeenCalledTimes(1);
    expect(mockedStatsApi.requestExtractions).toHaveBeenCalledWith({
      mode: 'BR',
      mediaPostIds: ['media-1', 'media-2'],
    });
    expect(navigation.navigate).not.toHaveBeenCalledWith('ExtractionReview', expect.anything());
  });

  it('shows "Processing…" for a QUEUED extraction and "Review →" for a PENDING one', async () => {
    mockedStatsApi.listExtractions.mockResolvedValue([
      { id: 'ext-1', status: 'QUEUED', rows: [], createdAt: new Date().toISOString() } as any,
      { id: 'ext-2', status: 'PENDING', rows: [{}], createdAt: new Date().toISOString() } as any,
    ]);
    render(<StatsHomeScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('Processing…');
    expect(screen.getByText('Review →')).toBeTruthy();
  });

  it('offers Retry/Discard for a FAILED extraction', async () => {
    mockedStatsApi.listExtractions.mockResolvedValue([
      {
        id: 'ext-1',
        status: 'FAILED',
        failureReason: 'boom',
        rows: [],
        createdAt: new Date().toISOString(),
      } as any,
    ]);
    mockedStatsApi.retryExtraction.mockResolvedValue({} as any);
    render(<StatsHomeScreen navigation={navigation} route={{} as any} />);

    await screen.findByText(/Couldn't read this screenshot/);
    await act(async () => {
      fireEvent.press(screen.getByText('Retry'));
    });
    expect(mockedStatsApi.retryExtraction).toHaveBeenCalledWith('ext-1');
  });

  it('tells a plain player a PENDING upload is awaiting the coach, instead of inviting them to review it', async () => {
    mockedUseAuth.mockReturnValue({ org: { role: 'PLAYER', isOwner: false } });
    mockedStatsApi.listExtractions.mockResolvedValue([
      { id: 'ext-1', status: 'PENDING', rows: [{}], createdAt: new Date().toISOString() } as any,
    ]);
    render(<StatsHomeScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('Pending review from coach');
    expect(screen.queryByText('Review →')).toBeNull();

    fireEvent.press(screen.getByText(/player\(s\)/));
    expect(navigation.navigate).not.toHaveBeenCalledWith(
      'ExtractionReview',
      expect.anything(),
    );
  });
});
