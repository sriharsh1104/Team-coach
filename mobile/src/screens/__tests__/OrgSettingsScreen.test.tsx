import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';
import { OrgSettingsScreen } from '../OrgSettingsScreen';
import * as orgApi from '../../api/org';
import { useAuth } from '../../auth/AuthContext';

jest.mock('../../api/org');
jest.mock('../../auth/AuthContext');
jest.mock('../../ui/confirmAsync', () => ({
  confirmAsync: jest.fn(async () => true),
}));

import { confirmAsync } from '../../ui/confirmAsync';

const mockedOrgApi = orgApi as jest.Mocked<typeof orgApi>;
const mockedUseAuth = useAuth as jest.Mock;
const mockedConfirm = confirmAsync as jest.MockedFunction<typeof confirmAsync>;
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
  mockedConfirm.mockResolvedValue(true);
  mockedOrgApi.getMyOrg.mockResolvedValue(detail as any);
  mockedUseAuth.mockReturnValue({ refreshOrg });
});

describe('OrgSettingsScreen', () => {
  it('shows settings only — no always-visible member list', async () => {
    render(<OrgSettingsScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('Chat History For New Members');
    expect(screen.getByLabelText('Transfer ownership')).toBeTruthy();
    expect(screen.queryByText('Members')).toBeNull();
    expect(screen.queryByText('Teammate')).toBeNull();
    expect(screen.queryByLabelText('Remove Teammate from roster')).toBeNull();
    expect(screen.queryByLabelText('Change role, currently Player')).toBeNull();
  });

  it('shows the chat-history switch reflecting the current setting, and flips it on toggle', async () => {
    mockedOrgApi.updateOrgSettings.mockResolvedValue({ historyVisibleToNewMembers: false });
    render(<OrgSettingsScreen navigation={navigation} route={{} as any} />);
    await screen.findByLabelText('Transfer ownership');

    const toggle = screen.getByLabelText('Chat history for new members');
    expect(toggle.props.value).toBe(true);

    await act(async () => {
      fireEvent(toggle, 'valueChange', false);
    });

    expect(mockedOrgApi.updateOrgSettings).toHaveBeenCalledWith(false);
    await screen.findByText('New members only see chat from when they join');
    expect(screen.getByLabelText('Chat history for new members').props.value).toBe(false);
  });

  it('reverts the chat-history switch if saving the setting fails', async () => {
    mockedOrgApi.updateOrgSettings.mockRejectedValue({
      response: { data: { message: 'Please try again.' } },
    });
    render(<OrgSettingsScreen navigation={navigation} route={{} as any} />);
    await screen.findByLabelText('Transfer ownership');

    await act(async () => {
      fireEvent(screen.getByLabelText('Chat history for new members'), 'valueChange', false);
    });

    expect(screen.getByLabelText('Chat history for new members').props.value).toBe(true);
  });

  it('bounces a non-owner straight back out', async () => {
    mockedOrgApi.getMyOrg.mockResolvedValue({ ...detail, isOwner: false } as any);
    render(<OrgSettingsScreen navigation={navigation} route={{} as any} />);

    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
  });

  it('opens a picker, then confirms before transferring ownership', async () => {
    mockedOrgApi.transferOwnership.mockResolvedValue(undefined);
    render(<OrgSettingsScreen navigation={navigation} route={{} as any} />);
    await screen.findByLabelText('Transfer ownership');

    fireEvent.press(screen.getByLabelText('Transfer ownership'));
    expect(screen.getByLabelText('Select Teammate')).toBeTruthy();
    expect(
      screen.getByText('Select a roster member, then confirm the transfer.'),
    ).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Select Teammate'));
    });

    expect(mockedConfirm).toHaveBeenCalledWith(
      'Transfer Ownership?',
      expect.stringContaining('Do you want to transfer ownership'),
      'Yes',
      'No',
    );
    expect(mockedOrgApi.transferOwnership).toHaveBeenCalledWith('user-2');
    expect(refreshOrg).toHaveBeenCalled();
    await screen.findByText('Teammate is now the owner');
  });

  it('does not transfer when confirm is cancelled', async () => {
    mockedConfirm.mockResolvedValue(false);
    render(<OrgSettingsScreen navigation={navigation} route={{} as any} />);
    await screen.findByLabelText('Transfer ownership');

    fireEvent.press(screen.getByLabelText('Transfer ownership'));
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Select Teammate'));
    });

    expect(mockedOrgApi.transferOwnership).not.toHaveBeenCalled();
  });

  it('disables transfer when there is nobody else on the roster', async () => {
    mockedOrgApi.getMyOrg.mockResolvedValue({
      ...detail,
      members: [detail.members[0]],
    } as any);
    render(<OrgSettingsScreen navigation={navigation} route={{} as any} />);

    await screen.findByText(/No other roster members yet/);
    expect(screen.getByLabelText('Transfer ownership')).toBeDisabled();
  });
});
