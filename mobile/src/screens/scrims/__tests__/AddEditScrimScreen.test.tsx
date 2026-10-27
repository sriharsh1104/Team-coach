import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { AddEditScrimScreen } from '../AddEditScrimScreen';
import * as scrimsApi from '../../../api/scrims';

jest.mock('../../../api/scrims');
// Native date/time picker UI isn't under test here; these screens never open
// it in a way that needs simulated selection, so a non-rendering stub avoids
// pulling in the real native module under Jest.
jest.mock('@react-native-community/datetimepicker', () => () => null);

const mockedScrimsApi = scrimsApi as jest.Mocked<typeof scrimsApi>;
const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any;

const existingScrim = {
  id: 'scrim-1',
  type: 'TOURNAMENT',
  title: 'Regional Finals',
  scheduledAt: '2030-06-15T14:30:00.000Z',
  platform: 'https://discord.gg/example',
  notes: 'Bring backup headset',
  createdById: 'user-1',
  createdByName: 'Me',
  remind30: true,
  remind10: true,
  rounds: [
    {
      id: 'r1',
      roundNumber: 1,
      scheduledAt: '2030-06-15T14:30:00.000Z',
      result: 'PENDING',
    },
  ],
};

async function pressAndSettle(text: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(text));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('AddEditScrimScreen', () => {
  it('shows "Add Scrim / Tournament" title and no delete option when creating', () => {
    render(<AddEditScrimScreen navigation={navigation} route={{ params: {} } as any} />);

    expect(screen.getByText('Add Scrim / Tournament')).toBeTruthy();
    expect(screen.queryByText('Delete Entry')).toBeNull();
  });

  it('pre-fills fields and shows "Edit Entry" / delete option when editing', () => {
    render(
      <AddEditScrimScreen
        navigation={navigation}
        route={{ params: { scrim: existingScrim } } as any}
      />,
    );

    expect(screen.getByText('Edit Entry')).toBeTruthy();
    expect(screen.getByDisplayValue('Regional Finals')).toBeTruthy();
    expect(screen.getByDisplayValue('https://discord.gg/example')).toBeTruthy();
    expect(screen.getByDisplayValue('Bring backup headset')).toBeTruthy();
    expect(screen.getByText('Delete Entry')).toBeTruthy();
    expect(screen.getByText('Rounds')).toBeTruthy();
    expect(screen.getByText('Round 1')).toBeTruthy();
  });

  it('SCRIM has no rounds/qualification UI at all — just a single Date & Time field', () => {
    render(<AddEditScrimScreen navigation={navigation} route={{ params: {} } as any} />);

    // SCRIM is the default type.
    expect(screen.queryByText('Rounds')).toBeNull();
    expect(screen.queryByText('Round 1')).toBeNull();
    expect(screen.queryByText('+ Add Round')).toBeNull();
    expect(screen.queryByText('Qualified')).toBeNull();
    expect(screen.getByText('Date & Time')).toBeTruthy();
  });

  it('switching to TOURNAMENT reveals the Rounds UI; switching back to SCRIM hides it again', async () => {
    render(<AddEditScrimScreen navigation={navigation} route={{ params: {} } as any} />);

    fireEvent.press(screen.getByText('Tournament'));
    expect(screen.getByText('Rounds')).toBeTruthy();
    expect(screen.getByText('Round 1')).toBeTruthy();
    expect(screen.getByText('Qualified')).toBeTruthy();

    fireEvent.press(screen.getByText('Scrim'));
    expect(screen.queryByText('Rounds')).toBeNull();
    expect(screen.queryByText('Qualified')).toBeNull();
  });

  it("defaults a brand-new entry's time to PM, even if the real clock is in the AM", () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 0, 1, 9, 30)); // 9:30 AM

    render(<AddEditScrimScreen navigation={navigation} route={{ params: {} } as any} />);

    expect(screen.getByText(/09:30 PM/)).toBeTruthy();

    jest.useRealTimers();
  });

  it("switching back to SCRIM after adding extra tournament rounds collapses to a single round on save", async () => {
    mockedScrimsApi.createScrim.mockResolvedValue(existingScrim as any);
    render(<AddEditScrimScreen navigation={navigation} route={{ params: {} } as any} />);

    fireEvent.press(screen.getByText('Tournament'));
    fireEvent.press(screen.getByText('+ Add Round'));
    expect(screen.getByText('Round 2')).toBeTruthy();

    fireEvent.press(screen.getByText('Scrim'));
    fireEvent.changeText(
      screen.getByPlaceholderText('Title (e.g. Practice vs Team Beta)'),
      'Practice Match',
    );
    await pressAndSettle('Save');

    expect(mockedScrimsApi.createScrim).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SCRIM',
        rounds: [expect.objectContaining({ roundNumber: 1, result: 'PENDING' })],
      }),
    );
  });

  it('blocks saving until a title is entered', async () => {
    render(<AddEditScrimScreen navigation={navigation} route={{ params: {} } as any} />);

    await pressAndSettle('Save');
    expect(mockedScrimsApi.createScrim).not.toHaveBeenCalled();
  });

  it('creates a new scrim with trimmed title and type, sending undefined for empty optional fields', async () => {
    mockedScrimsApi.createScrim.mockResolvedValue(existingScrim as any);
    render(<AddEditScrimScreen navigation={navigation} route={{ params: {} } as any} />);

    fireEvent.press(screen.getByText('Tournament'));
    fireEvent.changeText(
      screen.getByPlaceholderText('Title (e.g. Practice vs Team Beta)'),
      '  Grand Final  ',
    );
    await pressAndSettle('Save');

    expect(mockedScrimsApi.createScrim).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'TOURNAMENT',
        title: 'Grand Final',
        platform: undefined,
        notes: undefined,
      }),
    );
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('updates an existing scrim by id', async () => {
    mockedScrimsApi.updateScrim.mockResolvedValue(existingScrim as any);
    render(
      <AddEditScrimScreen
        navigation={navigation}
        route={{ params: { scrim: existingScrim } } as any}
      />,
    );

    await pressAndSettle('Save');

    expect(mockedScrimsApi.updateScrim).toHaveBeenCalledWith(
      'scrim-1',
      expect.objectContaining({ title: 'Regional Finals', type: 'TOURNAMENT' }),
    );
    expect(mockedScrimsApi.createScrim).not.toHaveBeenCalled();
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('shows an error alert and stays on screen when save fails', async () => {
    mockedScrimsApi.createScrim.mockRejectedValue({
      response: { data: { message: 'A scrim already exists at that time' } },
    });
    render(<AddEditScrimScreen navigation={navigation} route={{ params: {} } as any} />);

    fireEvent.changeText(
      screen.getByPlaceholderText('Title (e.g. Practice vs Team Beta)'),
      'Practice',
    );
    await pressAndSettle('Save');

    expect(Alert.alert).toHaveBeenCalledWith(
      'Could not save',
      'A scrim already exists at that time',
    );
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('deletes the entry after confirming, then navigates back', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const deleteButton = buttons?.find((b) => b.text === 'Delete');
      deleteButton?.onPress?.(undefined as any);
    });
    mockedScrimsApi.deleteScrim.mockResolvedValue(undefined as any);
    render(
      <AddEditScrimScreen
        navigation={navigation}
        route={{ params: { scrim: existingScrim } } as any}
      />,
    );

    await pressAndSettle('Delete Entry');

    expect(mockedScrimsApi.deleteScrim).toHaveBeenCalledWith('scrim-1');
    expect(navigation.goBack).toHaveBeenCalled();
  });
});
