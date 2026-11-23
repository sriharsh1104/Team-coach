import React from 'react';
import { Alert } from 'react-native';
import { Linking } from 'react-native';
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
  inGameUid: '5123456789',
  phone: '+919999999999',
  whatsappUrl: null,
  instagramUrl: null,
  discordUrl: 'https://discord.gg/example',
  youtubeUrl: null,
  kickUrl: null,
  devices: [{ id: 'device-1', name: 'Main rig', model: 'ROG Phone 8' }],
  role: 'COACH' as const,
  isOwner: true,
};

const mockRefreshUser = jest.fn();

function goToGameTab() {
  fireEvent.press(screen.getByText('Game'));
}

function goToDevicesTab() {
  fireEvent.press(screen.getByText('Devices'));
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
      expect(screen.getByText('+919999999999')).toBeTruthy();
      expect(screen.getByText('Edit')).toBeTruthy();
      expect(screen.queryByText('Name *')).toBeNull();
    });

    it('pressing Edit shows the name input, the signup email, and the Telegram phone verify button', async () => {
      render(<ProfileScreen />);
      await enterEditMode();

      expect(screen.getByDisplayValue('Player 1')).toBeTruthy();
      expect(screen.getByText('player1@example.com')).toBeTruthy();
      expect(screen.getByText('Verify on Telegram')).toBeTruthy();
      expect(screen.queryByPlaceholderText('Phone number')).toBeNull();
    });

    it('saves only the name (phone is never sent from this form), then returns to the view', async () => {
      mockedUsersApi.updateMyProfile.mockResolvedValue({ ...baseProfile, name: 'New Name' });
      render(<ProfileScreen />);
      await enterEditMode();

      fireEvent.changeText(screen.getByDisplayValue('Player 1'), 'New Name');
      await act(async () => {
        fireEvent.press(screen.getByText('Save'));
      });

      expect(mockedUsersApi.updateMyProfile).toHaveBeenCalledWith({
        name: 'New Name',
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

      await screen.findByText('Invalid name');
    });
  });

  describe('Phone via Telegram (type number → Telegram → enter code)', () => {
    it('sends the typed number, opens the bot, then asks for the 6-digit code', async () => {
      mockedUsersApi.getMyProfile.mockResolvedValue({ ...baseProfile, phone: null });
      mockedUsersApi.startTelegramPhoneVerification.mockResolvedValue({
        deepLink: 'https://t.me/TeamCoachBot?start=abc',
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      });
      const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);
      render(<ProfileScreen />);
      await enterEditMode();

      // Can't start without a number.
      await act(async () => {
        fireEvent.press(screen.getByText('Verify on Telegram'));
      });
      expect(mockedUsersApi.startTelegramPhoneVerification).not.toHaveBeenCalled();

      fireEvent.changeText(screen.getByLabelText('Phone number'), '+91 98765 43210');
      await act(async () => {
        fireEvent.press(screen.getByText('Verify on Telegram'));
      });

      expect(mockedUsersApi.startTelegramPhoneVerification).toHaveBeenCalledWith(
        '+91 98765 43210',
      );
      expect(openSpy).toHaveBeenCalledWith('https://t.me/TeamCoachBot?start=abc');
      await screen.findByLabelText('Telegram verification code');
      expect(screen.getByText('Verify code')).toBeTruthy();
      openSpy.mockRestore();
    });

    it('verifies the code, refreshes the profile and shows the verified badge', async () => {
      const verified = {
        ...baseProfile,
        phone: '9876543210',
        phoneVerifiedAt: '2026-11-20T10:00:00.000Z',
      };
      mockedUsersApi.getMyProfile
        .mockResolvedValueOnce({ ...baseProfile, phone: null })
        .mockResolvedValue(verified);
      mockedUsersApi.startTelegramPhoneVerification.mockResolvedValue({
        deepLink: 'https://t.me/TeamCoachBot?start=abc',
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      });
      mockedUsersApi.confirmTelegramPhoneCode.mockResolvedValue({ phone: '9876543210' });
      const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);
      render(<ProfileScreen />);
      await enterEditMode();

      fireEvent.changeText(screen.getByLabelText('Phone number'), '9876543210');
      await act(async () => {
        fireEvent.press(screen.getByText('Verify on Telegram'));
      });
      await screen.findByLabelText('Telegram verification code');

      // Needs all 6 digits before it can be submitted.
      fireEvent.changeText(screen.getByLabelText('Telegram verification code'), '123');
      await act(async () => {
        fireEvent.press(screen.getByText('Verify code'));
      });
      expect(mockedUsersApi.confirmTelegramPhoneCode).not.toHaveBeenCalled();

      fireEvent.changeText(screen.getByLabelText('Telegram verification code'), '123456');
      await act(async () => {
        fireEvent.press(screen.getByText('Verify code'));
      });

      expect(mockedUsersApi.confirmTelegramPhoneCode).toHaveBeenCalledWith('123456');
      await screen.findByText('9876543210 · verified on Telegram ✓');
      openSpy.mockRestore();
    });

    it('shows the server error when the code is wrong and stays on the code step', async () => {
      mockedUsersApi.getMyProfile.mockResolvedValue({ ...baseProfile, phone: null });
      mockedUsersApi.startTelegramPhoneVerification.mockResolvedValue({
        deepLink: 'https://t.me/TeamCoachBot?start=abc',
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      });
      mockedUsersApi.confirmTelegramPhoneCode.mockRejectedValue({
        response: { data: { message: 'Incorrect code. Check Telegram and try again.' } },
      });
      const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);
      render(<ProfileScreen />);
      await enterEditMode();

      fireEvent.changeText(screen.getByLabelText('Phone number'), '9876543210');
      await act(async () => {
        fireEvent.press(screen.getByText('Verify on Telegram'));
      });
      fireEvent.changeText(
        await screen.findByLabelText('Telegram verification code'),
        '000000',
      );
      await act(async () => {
        fireEvent.press(screen.getByText('Verify code'));
      });

      await screen.findByText('Incorrect code. Check Telegram and try again.');
      expect(screen.getByLabelText('Telegram verification code')).toBeTruthy();
      openSpy.mockRestore();
    });

    it('shows a verified badge instead of the form once the phone is verified', async () => {
      mockedUsersApi.getMyProfile.mockResolvedValue({
        ...baseProfile,
        phoneVerifiedAt: '2026-11-20T10:00:00.000Z',
      });
      render(<ProfileScreen />);
      await enterEditMode();

      await screen.findByText('+919999999999 · verified on Telegram ✓');
      expect(screen.queryByText('Verify on Telegram')).toBeNull();
      expect(screen.getByText('Change number')).toBeTruthy();
    });
  });

  describe('Game Profile tab', () => {
    async function enterGameEditMode() {
      await screen.findByText('Coach (Owner)');
      goToGameTab();
      await act(async () => {
        fireEvent.press(screen.getByText('Edit'));
      });
      await screen.findByText('Role');
    }

    it('shows a read-only view with IGN/UID and its own Edit button (devices live on Devices tab)', async () => {
      render(<ProfileScreen />);
      await screen.findByText('Coach (Owner)');
      goToGameTab();

      expect(screen.getByText('ShadowStrike')).toBeTruthy();
      expect(screen.getByText('5123456789')).toBeTruthy();
      expect(screen.queryByText('Main rig — ROG Phone 8')).toBeNull();
      expect(screen.getByText('Edit')).toBeTruthy();
      expect(screen.queryByText('Role')).toBeNull();
    });

    it('pressing Edit reveals the editable form, pre-filled from the current profile', async () => {
      render(<ProfileScreen />);
      await enterGameEditMode();

      expect(screen.getByDisplayValue('ShadowStrike')).toBeTruthy();
      expect(screen.getByDisplayValue('5123456789')).toBeTruthy();
      expect(screen.getByText('Primary rusher')).toBeTruthy();
      expect(screen.getByText('Grenadier/support')).toBeTruthy();
      expect(screen.queryByText('Add Device')).toBeNull();
    });

    it('UID field keeps digits only', async () => {
      render(<ProfileScreen />);
      await enterGameEditMode();

      fireEvent.changeText(
        screen.getByPlaceholderText('Your in-game UID'),
        'AB12-34cd',
      );
      expect(screen.getByDisplayValue('1234')).toBeTruthy();
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

      fireEvent.press(screen.getByText('Sniper')); // replaces IGL — one role only
      await act(async () => {
        fireEvent.press(screen.getByText('Save'));
      });

      expect(mockedUsersApi.updateMyProfile).toHaveBeenCalledWith({
        roles: ['SNIPER'],
        inGameName: 'ShadowStrike',
        inGameUid: '5123456789',
      });
      await waitFor(() => expect(screen.getByText('Edit')).toBeTruthy());
      expect(screen.queryByText('Role')).toBeNull();
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

      await screen.findByText('Invalid role');
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

  describe('Devices Profile tab', () => {
    it('shows device list plus add inputs immediately (no Edit gate)', async () => {
      render(<ProfileScreen />);
      await screen.findByText('Coach (Owner)');
      goToDevicesTab();

      expect(screen.getByText('Main rig — ROG Phone 8')).toBeTruthy();
      expect(screen.getByText('Add Device')).toBeTruthy();
      expect(screen.getByPlaceholderText('Device name (e.g. Main rig)')).toBeTruthy();
      expect(
        screen.getByPlaceholderText('Device model (e.g. ROG Phone 8)'),
      ).toBeTruthy();
      expect(screen.getByLabelText('Remove Main rig')).toBeTruthy();
      expect(screen.queryByText('Edit')).toBeNull();
    });

    it('lets you add and remove devices from the open form', async () => {
      mockedUsersApi.addDevice.mockResolvedValue({
        id: 'device-2',
        name: 'Backup',
        model: 'iPhone 15',
      });
      mockedUsersApi.removeDevice.mockResolvedValue(undefined as any);
      mockedUsersApi.getMyProfile
        .mockResolvedValueOnce(baseProfile)
        .mockResolvedValueOnce({
          ...baseProfile,
          devices: [...baseProfile.devices, { id: 'device-2', name: 'Backup', model: 'iPhone 15' }],
        })
        .mockResolvedValueOnce({
          ...baseProfile,
          devices: [{ id: 'device-2', name: 'Backup', model: 'iPhone 15' }],
        });

      render(<ProfileScreen />);
      await screen.findByText('Coach (Owner)');
      goToDevicesTab();
      await screen.findByText('Add Device');

      await act(async () => {
        fireEvent.press(screen.getByText('Add Device'));
      });
      expect(mockedUsersApi.addDevice).not.toHaveBeenCalled();

      fireEvent.changeText(screen.getByPlaceholderText('Device name (e.g. Main rig)'), 'Backup');
      fireEvent.changeText(screen.getByPlaceholderText('Device model (e.g. ROG Phone 8)'), 'iPhone 15');
      await act(async () => {
        fireEvent.press(screen.getByText('Add Device'));
      });

      expect(mockedUsersApi.addDevice).toHaveBeenCalledWith('Backup', 'iPhone 15');
      await waitFor(() => expect(screen.getByText('Backup — iPhone 15')).toBeTruthy());

      await act(async () => {
        fireEvent.press(screen.getByLabelText('Remove Main rig'));
      });
      expect(mockedUsersApi.removeDevice).toHaveBeenCalledWith('device-1');
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
        kickUrl: null,
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
        kickUrl: undefined,
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

      await screen.findByText('Invalid URL');
    });
  });

  describe('mustComplete mode (forced post-login gate)', () => {
    it('starts both tabs directly in the editable form — no view-mode/Edit button', async () => {
      render(<ProfileScreen mustComplete />);
      await screen.findByText('Name *');

      expect(screen.queryByText('Edit')).toBeNull();
      expect(screen.getByText('Continue')).toBeTruthy();

      goToGameTab();
      await screen.findByText('Role');
      expect(screen.queryByText('Edit')).toBeNull();
      expect(screen.getByText('Continue')).toBeTruthy();
      expect(screen.queryByText('My Devices')).toBeNull();
    });

    it('lets a new user Continue past the User tab without any phone (Telegram verify is optional)', async () => {
      const noPhone = {
        ...baseProfile,
        inGameName: null,
        inGameUid: null,
        phone: null,
        phoneVerifiedAt: null,
      };
      mockedUsersApi.getMyProfile.mockResolvedValue(noPhone);
      mockedUsersApi.updateMyProfile.mockResolvedValue(noPhone);
      render(<ProfileScreen mustComplete />);
      await screen.findByText('Name *');

      expect(screen.getByText('Phone (optional)')).toBeTruthy();
      expect(screen.getByText('Verify on Telegram')).toBeTruthy();
      await act(async () => {
        fireEvent.press(screen.getByText('Continue'));
      });
      expect(mockedUsersApi.updateMyProfile).toHaveBeenCalledWith({ name: 'Player 1' });
      await screen.findByText('Role');
    });

    it('does not call refreshUser until BOTH tabs satisfy the required fields', async () => {
      // No phone at all; IGN/UID still missing.
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
        phone: null,
      });
      render(<ProfileScreen mustComplete />);
      await screen.findByText('Name *');

      // Saving the User tab alone isn't enough — IGN/UID still empty.
      await act(async () => {
        fireEvent.press(screen.getByText('Continue'));
      });
      expect(mockedUsersApi.updateMyProfile).toHaveBeenCalledWith({
        name: 'Player 1',
      });
      expect(mockRefreshUser).not.toHaveBeenCalled();
      // Auto-advance to Game profile after User Continue.
      await screen.findByText('Role');

      // Completing the Game tab (IGN + UID) satisfies isProfileComplete and
      // triggers refreshUser — no phone needed.
      mockedUsersApi.updateMyProfile.mockResolvedValue({
        ...baseProfile,
        phone: null,
      });
      fireEvent.changeText(screen.getByPlaceholderText('Your in-game name'), 'ShadowStrike');
      fireEvent.changeText(screen.getByPlaceholderText('Your in-game UID'), '5123456789');
      await act(async () => {
        fireEvent.press(screen.getByText('Continue'));
      });

      expect(mockRefreshUser).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(/^Saved/)).toBeNull();
    });
  });
});
