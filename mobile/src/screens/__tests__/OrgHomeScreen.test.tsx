import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';
import { OrgHomeScreen } from '../OrgHomeScreen';
import * as orgApi from '../../api/org';
import { useAuth } from '../../auth/AuthContext';

jest.mock('../../api/org');
jest.mock('../../auth/AuthContext');

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
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockedOrgApi.getMyOrg.mockResolvedValue(detail as any);
  mockedUseAuth.mockReturnValue({
    logout,
    refreshOrg,
    org: { id: 'org-1', name: 'Alpha Squad', role: 'COACH', isOwner: true },
  });
});

describe('OrgHomeScreen', () => {
  it('shows org name, code, member count, and every nav button', async () => {
    render(<OrgHomeScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('Org code: 75HCP3 · 2 member(s)');
    expect(screen.getByText('Team Chat')).toBeTruthy();
    expect(screen.getByText('Team Voice')).toBeTruthy();
    expect(screen.getByText('Media')).toBeTruthy();
    expect(screen.getByText('Scrims & Tournaments')).toBeTruthy();
    expect(screen.getByText('Stats')).toBeTruthy();
    expect(screen.getByText('Edit My Profile')).toBeTruthy();
  });

  it.each([
    ['Team Chat', 'Chat'],
    ['Team Voice', 'Voice'],
    ['Media', 'MediaFeed'],
    ['Scrims & Tournaments', 'Scrims'],
    ['Stats', 'Stats'],
    ['Edit My Profile', 'Profile'],
  ])('navigates to %s -> %s', async (buttonText, routeName) => {
    render(<OrgHomeScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Alpha Squad');

    fireEvent.press(screen.getByText(buttonText));
    expect(navigation.navigate).toHaveBeenCalledWith(routeName);
  });

  it('shows "(Owner)" next to the owner, and not next to other members', async () => {
    render(<OrgHomeScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('Owner Coach (Owner)');
    expect(screen.getByText('Teammate')).toBeTruthy();
    expect(screen.queryByText('Teammate (Owner)')).toBeNull();
  });

  it('navigates to MemberProfile when a member row is pressed', async () => {
    render(<OrgHomeScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Teammate');

    fireEvent.press(screen.getByText('Teammate'));
    expect(navigation.navigate).toHaveBeenCalledWith('MemberProfile', {
      userId: 'user-2',
      name: 'Teammate',
    });
  });

  it('shows "Make Owner" next to other members, but not next to the owner themselves, when I am the owner', async () => {
    render(<OrgHomeScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Teammate');

    expect(screen.getAllByText('Make Owner')).toHaveLength(1);
  });

  it('never shows "Make Owner" when I am not the owner', async () => {
    mockedUseAuth.mockReturnValue({
      logout,
      refreshOrg,
      org: { id: 'org-1', name: 'Alpha Squad', role: 'PLAYER', isOwner: false },
    });
    render(<OrgHomeScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Teammate');

    expect(screen.queryByText('Make Owner')).toBeNull();
  });

  it('transfers ownership after confirming, then refreshes the org and roster', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const confirm = buttons?.find((b) => b.text === 'Make Owner');
      confirm?.onPress?.(undefined as any);
    });
    mockedOrgApi.transferOwnership.mockResolvedValue(undefined);
    mockedOrgApi.getMyOrg
      .mockResolvedValueOnce(detail as any)
      .mockResolvedValueOnce({
        ...detail,
        isOwner: false,
        members: [
          { userId: 'user-1', name: 'Owner Coach', avatarUrl: null, role: 'COACH', isOwner: false },
          { userId: 'user-2', name: 'Teammate', avatarUrl: null, role: 'PLAYER', isOwner: true },
        ],
      } as any);
    render(<OrgHomeScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Teammate');

    await act(async () => {
      fireEvent.press(screen.getByText('Make Owner'));
    });

    expect(mockedOrgApi.transferOwnership).toHaveBeenCalledWith('user-2');
    expect(refreshOrg).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Teammate (Owner)')).toBeTruthy());
  });

  it('shows an error alert when the transfer fails', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const confirm = buttons?.find((b) => b.text === 'Make Owner');
      confirm?.onPress?.(undefined as any);
    });
    mockedOrgApi.transferOwnership.mockRejectedValue({
      response: { data: { message: 'Only the current owner can transfer ownership' } },
    });
    render(<OrgHomeScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Teammate');

    await act(async () => {
      fireEvent.press(screen.getByText('Make Owner'));
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Could not transfer ownership',
      'Only the current owner can transfer ownership',
    );
    expect(refreshOrg).not.toHaveBeenCalled();
  });

  it('calls logout when "Log out" is pressed', async () => {
    render(<OrgHomeScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Alpha Squad');

    fireEvent.press(screen.getByText('Log out'));
    expect(logout).toHaveBeenCalled();
  });
});
