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
  role: 'COACH' as const,
  isOwner: true,
};

const mockRefreshUser = jest.fn();

function goToGameTab() {
  fireEvent.press(screen.getByText('Game'));
}

function goToSocialTab() {
  fireEvent.press(screen.getByText('Social'));
}

async function enterEditMode() {
  await screen.findByText('Edit');
  await act(async () => {
    fireEvent.press(screen.getByText('Edit'));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockedUsersApi.getMyProfile.mockResolvedValue(baseProfile);
  mockedUseAuth.mockReturnValue({
    refreshUser: mockRefreshUser,
    user: { email: 'player1@example.com' },
  });
});

describe('ProfileScreen', () => {
  describe('User Profile tab (default, non-mustComplete)', () => {
    it('shows a read-only view first — name, org role badge, email, phone — with its own Edit button', async () => {
      render(<ProfileScreen />);

      await screen.findByText('Coach (Owner)');
      expect(screen.getAllByText('Player 1').length).toBeGreaterThan(0);
      expect(screen.getByText('player1@example.com')).toBeTruthy();
      expect(screen.getByText('9999999999')).toBeTruthy();
      expect(screen.getByText('Edit')).toBeTruthy();
      expect(screen.queryByText('Name *')).toBeNull();
    });

    it('pressing Edit reveals name + phone inputs, pre-filled, and shows the signup email as read-only', async () => {
      render(<ProfileScreen />);
      await enterEditMode();

      expect(screen.getByDisplayValue('Player 1')).toBeTruthy();
      expect(screen.getByDisplayValue('9999999999')).toBeTruthy();
      expect(screen.getByText('player1@example.com')).toBeTruthy();
    });

    it('saves a new name and phone, then returns to the view', async () => {
      mockedUsersApi.updateMyProfile.mockResolvedValue({ ...baseProfile, name: 'New Name' });
      render(<ProfileScreen />);
      await enterEditMode();

      fireEvent.changeText(screen.getByDisplayValue('Player 1'), 'New Name');
      await act(async () => {
        fireEvent.press(screen.getByText('Save'));
      });

      expect(mockedUsersApi.updateMyProfile).toHaveBeenCalledWith({
        name: 'New Name',
        phone: '9999999999',
      });
      await waitFor(() => expect(screen.getByText('Edit')).toBeTruthy());
      expect(screen.queryByText('Name *')).toBeNull();
    });

    it('blocks saving an empty name', async () => {
      render(<ProfileScreen />);
      await enterEditMode();

      fireEvent.changeText(screen.getByDisplayValue('Player 1'), '');
      await act(async () => {
        fireEvent.press(screen.getByText('Save'));
      });

      expect(mockedUsersApi.updateMyProfile).not.toHaveBeenCalled();
    });

    it('shows an error alert when save fails', async () => {
      mockedUsersApi.updateMyProfile.mockRejectedValue({
        response: { data: { message: 'Invalid name' } },
      });
      render(<ProfileScreen />);
      await enterEditMode();

      await act(async () => {
        fireEvent.press(screen.getByText('Save'));
      });

      expect(Alert.alert).toHaveBeenCalledWith('Could not save', 'Invalid name');
    });
  });

  describe('Game Profile tab', () => {
    async function enterGameEditMode() {
      await screen.findByText('Coach (Owner)');
      goToGameTab();
      await act(async () => {
        fireEvent.press(screen.getByText('Edit'));
      });
      await screen.findByText('Role(s)');
    }

    it('shows a read-only view with IGN/UID/socials/devices and its own Edit button', async () => {
      render(<ProfileScreen />);
      await screen.findByText('Coach (Owner)');
      goToGameTab();

      expect(screen.getByText('ShadowStrike')).toBeTruthy();
      expect(screen.getByText('UID-0001')).toBeTruthy();
      expect(screen.getByText('Main rig — ROG Phone 8')).toBeTruthy();
      expect(screen.getByText('Edit')).toBeTruthy();
      expect(screen.queryByText('Role(s)')).toBeNull();
    });

    it('pressing Edit reveals the editable form, pre-filled from the current profile', async () => {
      render(<ProfileScreen />);
      await enterGameEditMode();

      expect(screen.getByDisplayValue('ShadowStrike')).toBeTruthy();
      expect(screen.getByDisplayValue('UID-0001')).toBeTruthy();
      expect(screen.getByText('Main rig — ROG Phone 8')).toBeTruthy();
    });

    it('copies the IGN field value when its Copy button is pressed', async () => {
      render(<ProfileScreen />);
      await enterGameEditMode();

      const copyButtons = screen.getAllByLabelText('Copy');
      await act(async () => {
        fireEvent.press(copyButtons[0]); // IGN is the first copy row
      });

      expect(Clipboard.setStringAsync).toHaveBeenCalledWith('ShadowStrike');
    });

    it('saves with roles toggled and empty fields sent as undefined, then returns to the view', async () => {
      mockedUsersApi.updateMyProfile.mockResolvedValue(baseProfile);
      render(<ProfileScreen />);
      await enterGameEditMode();

      fireEvent.press(screen.getByText('Sniper')); // add a second role
      await act(async () => {
        fireEvent.press(screen.getByText('Save'));
      });

      expect(mockedUsersApi.updateMyProfile).toHaveBeenCalledWith({
        roles: ['IGL', 'SNIPER'],
        inGameName: 'ShadowStrike',
        inGameUid: 'UID-0001',
      });
      await waitFor(() => expect(screen.getByText('Edit')).toBeTruthy());
      expect(screen.queryByText('Role(s)')).toBeNull();
    });

    it('shows an error alert when save fails', async () => {
      mockedUsersApi.updateMyProfile.mockRejectedValue({
        response: { data: { message: 'Invalid role' } },
      });
      render(<ProfileScreen />);
      await enterGameEditMode();

      await act(async () => {
        fireEvent.press(screen.getByText('Save'));
      });

      expect(Alert.alert).toHaveBeenCalledWith('Could not save', 'Invalid role');
    });

    it('blocks adding a device until both name and model are filled', async () => {
      render(<ProfileScreen />);
      await enterGameEditMode();

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
      await enterGameEditMode();

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
      await enterGameEditMode();

      await act(async () => {
        fireEvent.press(screen.getByText('Remove'));
      });

      expect(mockedUsersApi.removeDevice).toHaveBeenCalledWith('device-1');
      await waitFor(() => expect(screen.queryByText('Main rig — ROG Phone 8')).toBeNull());
    });

    it('IGN/UID stay optional outside mustComplete mode — Save is never blocked', async () => {
      mockedUsersApi.getMyProfile.mockResolvedValue({
        ...baseProfile,
        inGameName: null,
        inGameUid: null,
      });
      mockedUsersApi.updateMyProfile.mockResolvedValue(baseProfile);
      render(<ProfileScreen />);
      await enterGameEditMode();

      await act(async () => {
        fireEvent.press(screen.getByText('Save'));
      });
      expect(mockedUsersApi.updateMyProfile).toHaveBeenCalled();
    });
  });

  describe('Social Profile tab', () => {
    async function enterSocialEditMode() {
      await screen.findByText('Coach (Owner)');
      goToSocialTab();
      await act(async () => {
        fireEvent.press(screen.getByText('Edit'));
      });
      await screen.findByText('WhatsApp');
    }

    it('shows a read-only view with the social links and its own Edit button', async () => {
      render(<ProfileScreen />);
      await screen.findByText('Coach (Owner)');
      goToSocialTab();

      expect(screen.getByText('https://discord.gg/example')).toBeTruthy();
      expect(screen.getByText('Edit')).toBeTruthy();
      // Labels always show (even when not editing) — confirmed by checking
      // we're not accidentally in the edit form (no input placeholder).
      expect(screen.getByText('WhatsApp')).toBeTruthy();
      expect(screen.queryByPlaceholderText('WhatsApp URL')).toBeNull();
    });

    it('shows every platform label blank (not a "not set" message) when no social links are set yet', async () => {
      mockedUsersApi.getMyProfile.mockResolvedValue({
        ...baseProfile,
        whatsappUrl: null,
        instagramUrl: null,
        discordUrl: null,
        youtubeUrl: null,
      });
      render(<ProfileScreen />);
      await screen.findByText('Coach (Owner)');
      goToSocialTab();

      expect(screen.getByText('WhatsApp')).toBeTruthy();
      expect(screen.getByText('Instagram')).toBeTruthy();
      expect(screen.getByText('Discord')).toBeTruthy();
      expect(screen.getByText('YouTube')).toBeTruthy();
      expect(screen.queryByText('No social links set yet')).toBeNull();
    });

    it('pressing Edit reveals the social link inputs, pre-filled', async () => {
      render(<ProfileScreen />);
      await enterSocialEditMode();

      expect(screen.getByDisplayValue('https://discord.gg/example')).toBeTruthy();
    });

    it('saves only the social fields, with empty ones sent as undefined, then returns to the view', async () => {
      mockedUsersApi.updateMyProfile.mockResolvedValue(baseProfile);
      render(<ProfileScreen />);
      await enterSocialEditMode();

      await act(async () => {
        fireEvent.press(screen.getByText('Save'));
      });

      expect(mockedUsersApi.updateMyProfile).toHaveBeenCalledWith({
        whatsappUrl: undefined,
        instagramUrl: undefined,
        discordUrl: 'https://discord.gg/example',
        youtubeUrl: undefined,
      });
      await waitFor(() => expect(screen.getByText('Edit')).toBeTruthy());
      expect(screen.queryByPlaceholderText('WhatsApp URL')).toBeNull();
    });

    it('shows an error alert when save fails', async () => {
      mockedUsersApi.updateMyProfile.mockRejectedValue({
        response: { data: { message: 'Invalid URL' } },
      });
      render(<ProfileScreen />);
      await enterSocialEditMode();

      await act(async () => {
        fireEvent.press(screen.getByText('Save'));
      });

      expect(Alert.alert).toHaveBeenCalledWith('Could not save', 'Invalid URL');
    });
  });

  describe('mustComplete mode (forced post-login gate)', () => {
    it('starts both tabs directly in the editable form — no view-mode/Edit button', async () => {
      render(<ProfileScreen mustComplete />);
      await screen.findByText('Name *');

      expect(screen.queryByText('Edit')).toBeNull();
      expect(screen.getByText('Continue')).toBeTruthy();

      goToGameTab();
      await screen.findByText('Role(s)');
      expect(screen.queryByText('Edit')).toBeNull();
      expect(screen.getByText('Continue')).toBeTruthy();
      expect(screen.queryByText('My Devices')).toBeNull();
    });

    it('does not call refreshUser until BOTH tabs satisfy the required fields', async () => {
      mockedUsersApi.getMyProfile.mockResolvedValue({
        ...baseProfile,
        inGameName: null,
        inGameUid: null,
        phone: null,
      });
      mockedUsersApi.updateMyProfile.mockResolvedValue({
        ...baseProfile,
        inGameName: null,
        inGameUid: null,
        phone: '9999999999',
      });
      render(<ProfileScreen mustComplete />);
      await screen.findByText('Name *');

      // Saving the User tab alone (phone filled) isn't enough — IGN/UID still empty.
      fireEvent.changeText(screen.getByPlaceholderText('Your phone number'), '9999999999');
      await act(async () => {
        fireEvent.press(screen.getByText('Continue'));
      });
      expect(mockedUsersApi.updateMyProfile).toHaveBeenCalledWith({
        name: 'Player 1',
        phone: '9999999999',
      });
      expect(mockRefreshUser).not.toHaveBeenCalled();

      // Completing the Game tab (IGN + UID) on top of the now-saved phone
      // satisfies isProfileComplete and triggers refreshUser.
      mockedUsersApi.updateMyProfile.mockResolvedValue(baseProfile);
      goToGameTab();
      await screen.findByText('Role(s)');
      fireEvent.changeText(screen.getByPlaceholderText('Your in-game name'), 'ShadowStrike');
      fireEvent.changeText(screen.getByPlaceholderText('Your in-game UID'), 'UID-0001');
      await act(async () => {
        fireEvent.press(screen.getByText('Continue'));
      });

      expect(mockRefreshUser).toHaveBeenCalledTimes(1);
      expect(Alert.alert).not.toHaveBeenCalledWith('Saved', expect.anything());
    });
  });
});
