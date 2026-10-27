import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { ProfileScreen } from '../ProfileScreen';
import * as usersApi from '../../../api/users';
import { useAuth } from '../../../auth/AuthContext';

jest.mock('../../../api/users');
jest.mock('../../../auth/AuthContext');
const mockedUsersApi = usersApi as jest.Mocked<typeof usersApi>;
const mockedUseAuth = useAuth as jest.Mock;

const baseProfile = {
  id: 'user-1',
  name: 'Player 1',
  avatarUrl: null,
  roles: ['IGL'],
  inGameName: 'ShadowStrike',
  inGameUid: 'UID-0001',
  phone: '9999999999',
  whatsappUrl: null,
  instagramUrl: null,
  discordUrl: 'https://discord.gg/example',
  youtubeUrl: null,
  devices: [{ id: 'device-1', name: 'Main rig', model: 'ROG Phone 8' }],
  role: 'PLAYER' as const,
  isOwner: false,
};

const mockRefreshUser = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockedUsersApi.getMyProfile.mockResolvedValue(baseProfile);
  mockedUseAuth.mockReturnValue({ refreshUser: mockRefreshUser });
});

describe('ProfileScreen', () => {
  it('loads and pre-fills every field from the current profile', async () => {
    render(<ProfileScreen />);
    await screen.findByText('Role(s)');

    expect(screen.getByDisplayValue('ShadowStrike')).toBeTruthy();
    expect(screen.getByDisplayValue('UID-0001')).toBeTruthy();
    expect(screen.getByDisplayValue('https://discord.gg/example')).toBeTruthy();
    expect(screen.getByText('Main rig — ROG Phone 8')).toBeTruthy();
  });

  it('copies the IGN field value when its Copy button is pressed', async () => {
    render(<ProfileScreen />);
    await screen.findByText('Role(s)');

    const copyButtons = screen.getAllByLabelText('Copy');
    await act(async () => {
      fireEvent.press(copyButtons[0]); // IGN is the first copy row
    });

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('ShadowStrike');
  });

  it('saves with roles toggled and empty fields sent as undefined, not empty strings', async () => {
    mockedUsersApi.updateMyProfile.mockResolvedValue(baseProfile);
    render(<ProfileScreen />);
    await screen.findByText('Role(s)');

    fireEvent.press(screen.getByText('Sniper')); // add a second role
    await act(async () => {
      fireEvent.press(screen.getByText('Save Profile'));
    });

    expect(mockedUsersApi.updateMyProfile).toHaveBeenCalledWith({
      roles: ['IGL', 'SNIPER'],
      inGameName: 'ShadowStrike',
      inGameUid: 'UID-0001',
      phone: '9999999999',
      whatsappUrl: undefined,
      instagramUrl: undefined,
      discordUrl: 'https://discord.gg/example',
      youtubeUrl: undefined,
    });
  });

  it('shows an error alert when save fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockedUsersApi.updateMyProfile.mockRejectedValue({
      response: { data: { message: 'Invalid role' } },
    });
    render(<ProfileScreen />);
    await screen.findByText('Role(s)');

    await act(async () => {
      fireEvent.press(screen.getByText('Save Profile'));
    });

    expect(alertSpy).toHaveBeenCalledWith('Could not save', 'Invalid role');
  });

  it('blocks adding a device until both name and model are filled', async () => {
    render(<ProfileScreen />);
    await screen.findByText('Role(s)');

    await act(async () => {
      fireEvent.press(screen.getByText('Add Device'));
    });
    expect(mockedUsersApi.addDevice).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByPlaceholderText('Device name (e.g. Main rig)'), 'Backup');
    await act(async () => {
      fireEvent.press(screen.getByText('Add Device'));
    });
    expect(mockedUsersApi.addDevice).not.toHaveBeenCalled(); // model still empty
  });

  it('adds a device, clears the inputs, and reloads the device list', async () => {
    mockedUsersApi.addDevice.mockResolvedValue({
      id: 'device-2',
      name: 'Backup',
      model: 'iPhone 15',
    });
    mockedUsersApi.getMyProfile
      .mockResolvedValueOnce(baseProfile)
      .mockResolvedValueOnce({
        ...baseProfile,
        devices: [...baseProfile.devices, { id: 'device-2', name: 'Backup', model: 'iPhone 15' }],
      });

    render(<ProfileScreen />);
    await screen.findByText('Role(s)');

    fireEvent.changeText(screen.getByPlaceholderText('Device name (e.g. Main rig)'), 'Backup');
    fireEvent.changeText(screen.getByPlaceholderText('Device model (e.g. ROG Phone 8)'), 'iPhone 15');
    await act(async () => {
      fireEvent.press(screen.getByText('Add Device'));
    });

    expect(mockedUsersApi.addDevice).toHaveBeenCalledWith('Backup', 'iPhone 15');
    await waitFor(() => expect(screen.getByText('Backup — iPhone 15')).toBeTruthy());
    expect(screen.getByPlaceholderText('Device name (e.g. Main rig)').props.value).toBe('');
  });

  it('removes a device and reloads the list', async () => {
    mockedUsersApi.removeDevice.mockResolvedValue(undefined as any);
    mockedUsersApi.getMyProfile
      .mockResolvedValueOnce(baseProfile)
      .mockResolvedValueOnce({ ...baseProfile, devices: [] });

    render(<ProfileScreen />);
    await screen.findByText('Role(s)');

    await act(async () => {
      fireEvent.press(screen.getByText('Remove'));
    });

    expect(mockedUsersApi.removeDevice).toHaveBeenCalledWith('device-1');
    await waitFor(() => expect(screen.queryByText('Main rig — ROG Phone 8')).toBeNull());
  });

  describe('required fields (IGN / UID / Phone)', () => {
    it('disables Save when phone is cleared, even though it was prefilled', async () => {
      render(<ProfileScreen />);
      await screen.findByText('Role(s)');

      fireEvent.changeText(screen.getByDisplayValue('9999999999'), '');
      await act(async () => {
        fireEvent.press(screen.getByText('Save Profile'));
      });

      expect(mockedUsersApi.updateMyProfile).not.toHaveBeenCalled();
    });

    it('enables Save once IGN, UID, and phone are all filled', async () => {
      mockedUsersApi.getMyProfile.mockResolvedValue({
        ...baseProfile,
        inGameName: null,
        inGameUid: null,
        phone: null,
      });
      mockedUsersApi.updateMyProfile.mockResolvedValue(baseProfile);
      render(<ProfileScreen />);
      await screen.findByText('Role(s)');

      await act(async () => {
        fireEvent.press(screen.getByText('Save Profile'));
      });
      expect(mockedUsersApi.updateMyProfile).not.toHaveBeenCalled();

      fireEvent.changeText(screen.getByPlaceholderText('Your in-game name'), 'ShadowStrike');
      fireEvent.changeText(screen.getByPlaceholderText('Your in-game UID'), 'UID-0001');
      fireEvent.changeText(screen.getByPlaceholderText('Your phone number'), '9999999999');
      await act(async () => {
        fireEvent.press(screen.getByText('Save Profile'));
      });

      expect(mockedUsersApi.updateMyProfile).toHaveBeenCalled();
    });
  });

  describe('mustComplete mode (forced post-login gate)', () => {
    it('shows "Continue" instead of "Save Profile", and hides the Devices section', async () => {
      render(<ProfileScreen mustComplete />);
      await screen.findByText('Role(s)');

      expect(screen.getByText('Continue')).toBeTruthy();
      expect(screen.queryByText('Save Profile')).toBeNull();
      expect(screen.queryByText('My Devices')).toBeNull();
    });

    it('calls refreshUser (not the "Saved" alert) once the required fields are saved', async () => {
      mockedUsersApi.updateMyProfile.mockResolvedValue(baseProfile);
      render(<ProfileScreen mustComplete />);
      await screen.findByText('Role(s)');

      await act(async () => {
        fireEvent.press(screen.getByText('Continue'));
      });

      expect(mockedUsersApi.updateMyProfile).toHaveBeenCalled();
      expect(mockRefreshUser).toHaveBeenCalledTimes(1);
      expect(Alert.alert).not.toHaveBeenCalledWith('Saved', expect.anything());
    });
  });
});
