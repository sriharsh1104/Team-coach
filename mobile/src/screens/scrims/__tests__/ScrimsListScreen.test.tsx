import React from 'react';
import { Alert, Linking } from 'react-native';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';
import { ScrimsListScreen } from '../ScrimsListScreen';
import * as scrimsApi from '../../../api/scrims';
import { useAuth } from '../../../auth/AuthContext';

jest.mock('../../../api/scrims');
jest.mock('../../../auth/AuthContext');
// useFocusEffect needs a real NavigationContainer context to resolve
// useNavigation(); standalone screen tests have none, so it's reduced to a
// plain mount-time effect here (same behavior: load() runs once on render).
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, []),
}));

const mockedScrimsApi = scrimsApi as jest.Mocked<typeof scrimsApi>;
const mockedUseAuth = useAuth as jest.Mock;
const navigation = { navigate: jest.fn() } as any;

function scrim(overrides: Partial<any> = {}) {
  return {
    id: 's1',
    type: 'SCRIM',
    title: 'Practice vs Beta',
    scheduledAt: '2030-01-01T18:00:00.000Z',
    platform: null,
    notes: null,
    createdById: 'user-2',
    createdByName: 'Coach Dana',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('ScrimsListScreen', () => {
  it('shows the empty state when there are no events', async () => {
    mockedUseAuth.mockReturnValue({ user: { id: 'user-1' }, org: { role: 'PLAYER' } });
    mockedScrimsApi.listScrims.mockResolvedValue([]);
    render(<ScrimsListScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('Nothing scheduled yet.');
  });

  it('splits events into Upcoming and Past sections', async () => {
    mockedUseAuth.mockReturnValue({ user: { id: 'user-1' }, org: { role: 'PLAYER' } });
    mockedScrimsApi.listScrims.mockResolvedValue([
      scrim({ id: 'future', title: 'Future match', scheduledAt: '2099-01-01T00:00:00.000Z' }),
      scrim({ id: 'past', title: 'Old match', scheduledAt: '2000-01-01T00:00:00.000Z' }),
    ]);
    render(<ScrimsListScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('Future match');
    expect(screen.getByText('Upcoming')).toBeTruthy();
    expect(screen.getByText('Past')).toBeTruthy();
    expect(screen.getByText('Old match')).toBeTruthy();
  });

  it('SECURITY/LOGIC: hides Edit/Delete for a player who neither created the event nor coaches', async () => {
    mockedUseAuth.mockReturnValue({ user: { id: 'user-1' }, org: { role: 'PLAYER' } });
    mockedScrimsApi.listScrims.mockResolvedValue([
      scrim({ createdById: 'user-2', scheduledAt: '2099-01-01T00:00:00.000Z' }),
    ]);
    render(<ScrimsListScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('Practice vs Beta');
    expect(screen.queryByText('Edit')).toBeNull();
    expect(screen.queryByText('Delete')).toBeNull();
  });

  it('shows Edit/Delete for the player who created the event', async () => {
    mockedUseAuth.mockReturnValue({ user: { id: 'user-1' }, org: { role: 'PLAYER' } });
    mockedScrimsApi.listScrims.mockResolvedValue([
      scrim({ createdById: 'user-1', scheduledAt: '2099-01-01T00:00:00.000Z' }),
    ]);
    render(<ScrimsListScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('Practice vs Beta');
    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
  });

  it('shows Edit/Delete for any coach, even on events they did not create', async () => {
    mockedUseAuth.mockReturnValue({ user: { id: 'user-1' }, org: { role: 'COACH' } });
    mockedScrimsApi.listScrims.mockResolvedValue([
      scrim({ createdById: 'user-2', scheduledAt: '2099-01-01T00:00:00.000Z' }),
    ]);
    render(<ScrimsListScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('Practice vs Beta');
    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
  });

  it('shows Edit/Delete for the org owner, even when their own role is PLAYER, on events they did not create', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'user-1' },
      org: { role: 'PLAYER', isOwner: true },
    });
    mockedScrimsApi.listScrims.mockResolvedValue([
      scrim({ createdById: 'user-2', scheduledAt: '2099-01-01T00:00:00.000Z' }),
    ]);
    render(<ScrimsListScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('Practice vs Beta');
    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
  });

  it('hides Edit/Delete for a PLAYER who is not the owner and not the creator', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'user-1' },
      org: { role: 'PLAYER', isOwner: false },
    });
    mockedScrimsApi.listScrims.mockResolvedValue([
      scrim({ createdById: 'user-2', scheduledAt: '2099-01-01T00:00:00.000Z' }),
    ]);
    render(<ScrimsListScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('Practice vs Beta');
    expect(screen.queryByText('Edit')).toBeNull();
    expect(screen.queryByText('Delete')).toBeNull();
  });

  it('navigates to AddEditScrim with the event when Edit is pressed', async () => {
    mockedUseAuth.mockReturnValue({ user: { id: 'user-1' }, org: { role: 'COACH' } });
    const event = scrim({ scheduledAt: '2099-01-01T00:00:00.000Z' });
    mockedScrimsApi.listScrims.mockResolvedValue([event]);
    render(<ScrimsListScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('Practice vs Beta');
    fireEvent.press(screen.getByText('Edit'));

    expect(navigation.navigate).toHaveBeenCalledWith('AddEditScrim', { scrim: event });
  });

  it('navigates to AddEditScrim with no params when "Add" is pressed', async () => {
    mockedUseAuth.mockReturnValue({ user: { id: 'user-1' }, org: { role: 'PLAYER' } });
    mockedScrimsApi.listScrims.mockResolvedValue([]);
    render(<ScrimsListScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('Nothing scheduled yet.');
    fireEvent.press(screen.getByText('Add Scrim / Tournament'));

    expect(navigation.navigate).toHaveBeenCalledWith('AddEditScrim');
  });

  it('opens the platform link when pressed', async () => {
    const openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);
    mockedUseAuth.mockReturnValue({ user: { id: 'user-1' }, org: { role: 'PLAYER' } });
    mockedScrimsApi.listScrims.mockResolvedValue([
      scrim({
        scheduledAt: '2099-01-01T00:00:00.000Z',
        platform: 'https://discord.gg/example',
      }),
    ]);
    render(<ScrimsListScreen navigation={navigation} route={{} as any} />);

    const link = await screen.findByText('https://discord.gg/example');
    fireEvent.press(link);

    expect(openURLSpy).toHaveBeenCalledWith('https://discord.gg/example');
  });

  it('deletes the event after confirming, then reloads the list', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const deleteButton = buttons?.find((b) => b.text === 'Delete');
      deleteButton?.onPress?.(undefined as any);
    });
    mockedUseAuth.mockReturnValue({ user: { id: 'user-1' }, org: { role: 'COACH' } });
    mockedScrimsApi.deleteScrim.mockResolvedValue(undefined as any);
    mockedScrimsApi.listScrims
      .mockResolvedValueOnce([scrim({ scheduledAt: '2099-01-01T00:00:00.000Z' })])
      .mockResolvedValueOnce([]);
    render(<ScrimsListScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('Practice vs Beta');
    await act(async () => {
      fireEvent.press(screen.getByText('Delete'));
    });

    expect(mockedScrimsApi.deleteScrim).toHaveBeenCalledWith('s1');
    await waitFor(() => expect(screen.queryByText('Practice vs Beta')).toBeNull());
  });
});
