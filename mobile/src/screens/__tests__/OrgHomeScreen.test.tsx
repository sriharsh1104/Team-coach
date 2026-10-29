import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { OrgHomeScreen } from '../OrgHomeScreen';
import * as orgApi from '../../api/org';
import { useAuth } from '../../auth/AuthContext';

jest.mock('../../api/org');
jest.mock('../../auth/AuthContext');
jest.mock('../chat/ChatHubScreen', () => ({
  ChatHubScreen: ({ onLoadError }: { onLoadError?: (err: unknown) => void }) => {
    const { Text, Pressable } = require('react-native');
    return (
      <>
        <Text>Embedded Team Chat</Text>
        <Pressable onPress={() => onLoadError?.(new Error('boom'))}>
          <Text>Simulate Chat Load Error</Text>
        </Pressable>
      </>
    );
  },
}));

const mockedOrgApi = orgApi as jest.Mocked<typeof orgApi>;
const mockedUseAuth = useAuth as jest.Mock;
const navigation = { navigate: jest.fn() } as any;

const detail = {
  id: 'org-1',
  name: 'Alpha Squad',
  orgCode: '75HCP3',
  referralLink: 'token',
  myRole: 'COACH',
  isOwner: true,
  members: [
    { userId: 'user-1', name: 'Owner Coach', avatarUrl: null, role: 'COACH', isOwner: true },
    { userId: 'user-2', name: 'Teammate', avatarUrl: null, role: 'PLAYER', isOwner: false },
  ],
};

const logout = jest.fn();
const refreshOrg = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockedOrgApi.getMyOrg.mockResolvedValue(detail as any);
  mockedUseAuth.mockReturnValue({
    logout,
    refreshOrg,
    user: { id: 'user-1', name: 'Owner Coach', email: 'a@b.com' },
    org: { id: 'org-1', name: 'Alpha Squad', role: 'COACH', isOwner: true },
  });
});

describe('OrgHomeScreen', () => {
  it('defaults to the embedded team chat and shows org header', async () => {
    render(<OrgHomeScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('Org Code: 75HCP3');
    expect(screen.getByText(/2 Member\(s\)/)).toBeTruthy();
    expect(screen.getByText('Alpha Squad')).toBeTruthy();
    expect(screen.getByText('Embedded Team Chat')).toBeTruthy();
    expect(screen.queryByText('Team Voice')).toBeNull();
    expect(screen.queryByText('Security')).toBeNull();
  });

  it('copies the org code and shows a toast when the org code label is pressed', async () => {
    const Clipboard = require('expo-clipboard');
    render(<OrgHomeScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Org Code: 75HCP3');

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Copy Org Code'));
    });

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('75HCP3');
    expect(screen.getByText('Org code copied')).toBeTruthy();
  });

  it('opens the sidebar with all nav options (including owner-only Org Settings), with no Settings/Security or Logout in it', async () => {
    render(<OrgHomeScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Alpha Squad');

    fireEvent.press(screen.getByLabelText('Open Menu'));

    expect(screen.getByText('Chats')).toBeTruthy();
    expect(screen.getByText('Team Voice')).toBeTruthy();
    expect(screen.getByText('Media')).toBeTruthy();
    expect(screen.getByText('Stats & Schedule')).toBeTruthy();
    expect(screen.queryByText('Scrims & Tournaments')).toBeNull();
    expect(screen.getByText('Team Members')).toBeTruthy();
    expect(screen.getByText('Org Settings')).toBeTruthy();
    expect(screen.getByText('Profile')).toBeTruthy();
    expect(screen.queryByText('Security')).toBeNull();
    expect(screen.queryByText('Logout')).toBeNull();
    expect(screen.queryByText('Log Out')).toBeNull();
  });

  it('hides Org Settings from the sidebar when I am not the owner', async () => {
    mockedUseAuth.mockReturnValue({
      logout,
      refreshOrg,
      user: { id: 'user-2', name: 'Teammate', email: 'a@b.com' },
      org: { id: 'org-1', name: 'Alpha Squad', role: 'PLAYER', isOwner: false },
    });
    render(<OrgHomeScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Alpha Squad');

    fireEvent.press(screen.getByLabelText('Open Menu'));
    expect(screen.queryByText('Org Settings')).toBeNull();
  });

  it.each([
    ['Team Voice', 'Voice', undefined],
    ['Media', 'MediaFeed', undefined],
    ['Stats & Schedule', 'Stats', { mode: 'BR' }],
    ['Team Members', 'Members', undefined],
    ['Org Settings', 'OrgSettings', undefined],
    ['Profile', 'Profile', undefined],
  ])('navigates from sidebar %s -> %s', async (label, routeName, params) => {
    render(<OrgHomeScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Alpha Squad');

    fireEvent.press(screen.getByLabelText('Open Menu'));
    fireEvent.press(screen.getByText(label));
    if (params) {
      expect(navigation.navigate).toHaveBeenCalledWith(routeName, params);
    } else {
      expect(navigation.navigate).toHaveBeenCalledWith(routeName);
    }
  });

  it('opens a dropdown from the gear icon with Security and Logout, separated by a divider', async () => {
    render(<OrgHomeScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Alpha Squad');

    expect(screen.queryByText('Security')).toBeNull();
    expect(screen.queryByText('Logout')).toBeNull();

    fireEvent.press(screen.getByLabelText('Account Settings'));

    expect(screen.getByText('Security')).toBeTruthy();
    expect(screen.getByText('Logout')).toBeTruthy();
  });

  it('navigates to AccountSettings and closes the dropdown when Security is pressed', async () => {
    render(<OrgHomeScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Alpha Squad');

    fireEvent.press(screen.getByLabelText('Account Settings'));
    fireEvent.press(screen.getByText('Security'));

    expect(navigation.navigate).toHaveBeenCalledWith('AccountSettings');
    expect(screen.queryByText('Logout')).toBeNull();
  });

  it('calls logout and closes the dropdown when Logout is pressed', async () => {
    render(<OrgHomeScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Alpha Squad');

    fireEvent.press(screen.getByLabelText('Account Settings'));
    fireEvent.press(screen.getByText('Logout'));

    expect(logout).toHaveBeenCalled();
    expect(screen.queryByText('Security')).toBeNull();
  });

  it('closes the dropdown when the backdrop is pressed, without navigating or logging out', async () => {
    render(<OrgHomeScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Alpha Squad');

    fireEvent.press(screen.getByLabelText('Account Settings'));
    fireEvent.press(screen.getByLabelText('Close Account Settings Menu'));

    expect(screen.queryByText('Security')).toBeNull();
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
  });

  it('shows a toast when the embedded chat hub fails to load', async () => {
    render(<OrgHomeScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Embedded Team Chat');

    await act(async () => {
      fireEvent.press(screen.getByText('Simulate Chat Load Error'));
    });

    expect(screen.getByText('Could not load chats')).toBeTruthy();
  });
});
