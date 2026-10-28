import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';
import { OrgSettingsScreen } from '../OrgSettingsScreen';
import * as orgApi from '../../api/org';
import { useAuth } from '../../auth/AuthContext';

jest.mock('../../api/org');
jest.mock('../../auth/AuthContext');

const mockedOrgApi = orgApi as jest.Mocked<typeof orgApi>;
const mockedUseAuth = useAuth as jest.Mock;
const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any;

const detail = {
  id: 'org-1',
  name: 'Alpha Squad',
  orgCode: '75HCP3',
  referralLink: 'token',
  myRole: 'COACH',
  isOwner: true,
  historyVisibleToNewMembers: true,
  members: [
    { userId: 'user-1', name: 'Owner Coach', avatarUrl: null, role: 'COACH', isOwner: true },
    { userId: 'user-2', name: 'Teammate', avatarUrl: null, role: 'PLAYER', isOwner: false },
  ],
};

const refreshOrg = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockedOrgApi.getMyOrg.mockResolvedValue(detail as any);
  mockedUseAuth.mockReturnValue({ refreshOrg });
});

describe('OrgSettingsScreen', () => {
  it('shows every member with an owner badge, role pills, and Make Owner / Remove for non-owner rows', async () => {
    render(<OrgSettingsScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('Owner Coach (Owner)');
    expect(screen.getByText('Teammate')).toBeTruthy();
    // RoleSelector pills render for every row.
    expect(screen.getAllByText('Player')).toHaveLength(2);
    expect(screen.getAllByText('Coach')).toHaveLength(2);
    expect(screen.getAllByText('Analyst')).toHaveLength(2);
    // Only the non-owner row gets Make Owner / Remove.
    expect(screen.getAllByText('Make Owner')).toHaveLength(1);
    expect(screen.getAllByText('Remove')).toHaveLength(1);
  });

  it('shows the chat-history switch reflecting the current setting, and flips it on toggle', async () => {
    mockedOrgApi.updateOrgSettings.mockResolvedValue({ historyVisibleToNewMembers: false });
    render(<OrgSettingsScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Teammate');

    const toggle = screen.getByLabelText('Chat history for new members');
    expect(toggle.props.value).toBe(true);

    await act(async () => {
      fireEvent(toggle, 'valueChange', false);
    });

    expect(mockedOrgApi.updateOrgSettings).toHaveBeenCalledWith(false);
    await screen.findByText('New members only see chat from when they join');
    expect(screen.getByLabelText('Chat history for new members').props.value).toBe(false);
  });

  it('reverts the chat-history switch and shows an alert if saving the setting fails', async () => {
    mockedOrgApi.updateOrgSettings.mockRejectedValue({
      response: { data: { message: 'Please try again.' } },
    });
    render(<OrgSettingsScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Teammate');

    await act(async () => {
      fireEvent(screen.getByLabelText('Chat history for new members'), 'valueChange', false);
    });

    expect(Alert.alert).toHaveBeenCalledWith('Could not update setting', 'Please try again.');
    expect(screen.getByLabelText('Chat history for new members').props.value).toBe(true);
  });

  it('bounces a non-owner straight back out', async () => {
    mockedOrgApi.getMyOrg.mockResolvedValue({ ...detail, isOwner: false } as any);
    render(<OrgSettingsScreen navigation={navigation} route={{} as any} />);

    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
  });

  it('changes a member role when a different pill is pressed, then shows a toast and refreshes', async () => {
    mockedOrgApi.changeMemberRole.mockResolvedValue({ userId: 'user-2', role: 'COACH' });
    mockedOrgApi.getMyOrg
      .mockResolvedValueOnce(detail as any)
      .mockResolvedValueOnce({
        ...detail,
        members: [
          detail.members[0],
          { userId: 'user-2', name: 'Teammate', avatarUrl: null, role: 'COACH', isOwner: false },
        ],
      } as any);
    render(<OrgSettingsScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Teammate');

    // Teammate's row is the 2nd member card; its "Coach" pill is the 2nd "Coach" text.
    await act(async () => {
      fireEvent.press(screen.getAllByText('Coach')[1]);
    });

    expect(mockedOrgApi.changeMemberRole).toHaveBeenCalledWith('user-2', 'COACH');
    expect(refreshOrg).toHaveBeenCalled();
    await screen.findByText('Teammate is now Coach');
  });

  it('does not call the API when the already-active role pill is pressed', async () => {
    render(<OrgSettingsScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Teammate');

    // Teammate is already PLAYER — its "Player" pill is the 2nd one.
    await act(async () => {
      fireEvent.press(screen.getAllByText('Player')[1]);
    });

    expect(mockedOrgApi.changeMemberRole).not.toHaveBeenCalled();
  });

  it('shows an error alert when changing role fails', async () => {
    mockedOrgApi.changeMemberRole.mockRejectedValue({
      response: { data: { message: 'This org already has the maximum of 2 coach(s)' } },
    });
    render(<OrgSettingsScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Teammate');

    await act(async () => {
      fireEvent.press(screen.getAllByText('Coach')[1]);
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Could not change role',
      'This org already has the maximum of 2 coach(s)',
    );
  });

  it('transfers ownership after confirming', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const confirm = buttons?.find((b) => b.text === 'Make Owner');
      confirm?.onPress?.(undefined as any);
    });
    mockedOrgApi.transferOwnership.mockResolvedValue(undefined);
    render(<OrgSettingsScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Teammate');

    await act(async () => {
      fireEvent.press(screen.getByText('Make Owner'));
    });

    expect(mockedOrgApi.transferOwnership).toHaveBeenCalledWith('user-2');
    expect(refreshOrg).toHaveBeenCalled();
  });

  it('removes a member after confirming, then shows a toast and reloads', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const confirm = buttons?.find((b) => b.text === 'Remove');
      confirm?.onPress?.(undefined as any);
    });
    mockedOrgApi.removeMember.mockResolvedValue(undefined);
    mockedOrgApi.getMyOrg
      .mockResolvedValueOnce(detail as any)
      .mockResolvedValueOnce({ ...detail, members: [detail.members[0]] } as any);
    render(<OrgSettingsScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Teammate');

    await act(async () => {
      fireEvent.press(screen.getByText('Remove'));
    });

    expect(mockedOrgApi.removeMember).toHaveBeenCalledWith('user-2');
    await screen.findByText('Teammate removed');
    await waitFor(() => expect(screen.queryByText('Teammate')).toBeNull());
  });

  it('shows an error alert when removal fails', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const confirm = buttons?.find((b) => b.text === 'Remove');
      confirm?.onPress?.(undefined as any);
    });
    mockedOrgApi.removeMember.mockRejectedValue({
      response: { data: { message: 'Please try again.' } },
    });
    render(<OrgSettingsScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Teammate');

    await act(async () => {
      fireEvent.press(screen.getByText('Remove'));
    });

    expect(Alert.alert).toHaveBeenCalledWith('Could not remove member', 'Please try again.');
  });
});
