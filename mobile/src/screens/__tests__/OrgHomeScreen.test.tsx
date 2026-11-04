import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { OrgHomeScreen } from '../OrgHomeScreen';
import * as orgApi from '../../api/org';
import { useAuth } from '../../auth/AuthContext';

jest.mock('../../api/org');
jest.mock('../../auth/AuthContext');
jest.mock('../chat/ChatHubScreen', () => {
  const ReactLib = require('react');
  const { Text, Pressable } = require('react-native');
  return {
    ChatHubScreen: function MockChatHub(props: { onLoadError?: (e: unknown) => void }) {
      return ReactLib.createElement(
        ReactLib.Fragment,
        null,
        ReactLib.createElement(Text, null, 'Embedded Team Chat'),
        ReactLib.createElement(
          Pressable,
          {
            onPress: () => props.onLoadError?.(new Error('boom')),
          },
          ReactLib.createElement(Text, null, 'Simulate Chat Load Error'),
        ),
      );
    },
  };
});

const mockedOrgApi = orgApi as jest.Mocked<typeof orgApi>;
const mockedUseAuth = useAuth as jest.Mock;
const navigation = { navigate: jest.fn() } as any;

const detail = {
  id: 'org-1',
  name: 'Alpha Squad',
  orgCode: '75HCP3AB',
  referralLink: 'token',
  myRole: 'COACH',
  isOwner: true,
  members: [
    {
      userId: 'user-1',
      name: 'Owner Coach',
      avatarUrl: null,
      role: 'COACH',
      isOwner: true,
    },
    {
      userId: 'user-2',
      name: 'Teammate',
      avatarUrl: null,
      role: 'PLAYER',
      isOwner: false,
    },
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

    await screen.findByText('Org Code: 75HCP3AB');
    expect(screen.getByText(/2 Member\(s\)/)).toBeTruthy();
    expect(screen.getByText('Alpha Squad')).toBeTruthy();
    expect(screen.getByText('Embedded Team Chat')).toBeTruthy();
  });

  it('opens the owner sidebar with Esports Arena / Guild / Account sections', async () => {
    render(<OrgHomeScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Alpha Squad');

    fireEvent.press(screen.getByLabelText('Open Menu'));

    expect(screen.getByText('Sacred Esports')).toBeTruthy();
    expect(screen.getByText('Esports Arena')).toBeTruthy();
    expect(screen.getByText('Guild')).toBeTruthy();
    expect(screen.getByText('Guild Chat')).toBeTruthy();
    expect(screen.getByText('Guild Roster')).toBeTruthy();
    expect(screen.getByText('Account')).toBeTruthy();
    expect(screen.getByText('Roster')).toBeTruthy();
    expect(screen.getByText('Org Settings')).toBeTruthy();
  });

  it('hides Guild and Org Settings from non-owners', async () => {
    mockedUseAuth.mockReturnValue({
      logout,
      refreshOrg,
      user: { id: 'user-2', name: 'Teammate', email: 'a@b.com' },
      org: { id: 'org-1', name: 'Alpha Squad', role: 'PLAYER', isOwner: false },
    });
    render(<OrgHomeScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Alpha Squad');

    fireEvent.press(screen.getByLabelText('Open Menu'));
    expect(screen.getByText('Roster')).toBeTruthy();
    expect(screen.queryByText('Org Settings')).toBeNull();
    expect(screen.queryByText('Guild')).toBeNull();
  });

  it('navigates to Roster from the sidebar', async () => {
    render(<OrgHomeScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Alpha Squad');

    fireEvent.press(screen.getByLabelText('Open Menu'));
    fireEvent.press(screen.getByText('Roster'));
    expect(navigation.navigate).toHaveBeenCalledWith('Members');
  });

  it('opens Security and Logout from the gear menu', async () => {
    render(<OrgHomeScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Alpha Squad');

    fireEvent.press(screen.getByLabelText('Account Settings'));
    expect(screen.getByText('Security')).toBeTruthy();
    expect(screen.getByText('Logout')).toBeTruthy();
  });

  it('calls logout when Logout is pressed', async () => {
    render(<OrgHomeScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Alpha Squad');

    fireEvent.press(screen.getByLabelText('Account Settings'));
    fireEvent.press(screen.getByText('Logout'));
    expect(logout).toHaveBeenCalled();
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
