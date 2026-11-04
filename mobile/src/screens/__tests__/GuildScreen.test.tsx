import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';
import { GuildScreen } from '../GuildScreen';
import * as orgApi from '../../api/org';
import { useAuth } from '../../auth/AuthContext';

jest.mock('../../api/org');
jest.mock('../../auth/AuthContext');

const mockedOrgApi = orgApi as jest.Mocked<typeof orgApi>;
const mockedUseAuth = useAuth as jest.Mock;
const navigation = { navigate: jest.fn(), push: jest.fn(), goBack: jest.fn() } as any;

const detail = {
  id: 'org-1',
  name: 'Alpha Squad',
  orgCode: '75HCP3',
  referralLink: 'https://app.example.com/join/token',
  myGuildRole: 'LEADER',
  onRoster: true,
  canManageRoster: true,
  roster: [
    { userId: 'user-1', name: 'Owner Coach', inGameName: 'OC', role: null, isOwner: true },
    { userId: 'user-2', name: 'Teammate', inGameName: 'TM', role: 'PLAYER', isOwner: false },
  ],
  members: [
    {
      userId: 'user-1',
      name: 'Owner Coach',
      inGameName: 'OC',
      guildRole: 'LEADER',
      onRoster: true,
      rosterRole: null,
      isOwner: true,
    },
    {
      userId: 'user-2',
      name: 'Teammate',
      inGameName: 'TM',
      guildRole: 'MEMBER',
      onRoster: true,
      rosterRole: 'PLAYER',
      isOwner: false,
    },
    {
      userId: 'user-3',
      name: 'Waiting Member',
      inGameName: null,
      guildRole: 'MEMBER',
      onRoster: false,
      rosterRole: null,
      isOwner: false,
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockedOrgApi.getMyGuild.mockResolvedValue(detail as any);
  mockedUseAuth.mockReturnValue({ user: { id: 'user-1' } });
});

describe('GuildScreen', () => {
  it('shows the guild header, invite code/link, and every guild member with roster status', async () => {
    render(<GuildScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('Alpha Squad');
    expect(screen.getByText('Guild Code')).toBeTruthy();
    expect(screen.getByText('75HCP3')).toBeTruthy();
    expect(screen.getByText('Waiting Member')).toBeTruthy();
    expect(screen.getByText(/Not on roster/)).toBeTruthy();
  });

  it('adds a waiting guild member to the roster with the selected role', async () => {
    mockedOrgApi.addGuildMemberToRoster.mockResolvedValue({ userId: 'user-3', role: 'COACH' });
    mockedOrgApi.getMyGuild
      .mockResolvedValueOnce(detail as any)
      .mockResolvedValueOnce({
        ...detail,
        members: [
          detail.members[0],
          detail.members[1],
          { ...detail.members[2], onRoster: true, rosterRole: 'COACH' },
        ],
      } as any);
    render(<GuildScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Waiting Member');

    await act(async () => {
      fireEvent.press(screen.getByText('Coach'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Add to roster'));
    });

    expect(mockedOrgApi.addGuildMemberToRoster).toHaveBeenCalledWith('user-3', 'COACH');
    await screen.findByText('Waiting Member added to roster');
  });

  it('does not show roster-management controls to a member who cannot manage the roster', async () => {
    mockedOrgApi.getMyGuild.mockResolvedValue({
      ...detail,
      canManageRoster: false,
    } as any);
    render(<GuildScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Waiting Member');

    expect(screen.queryByText('Add to roster')).toBeNull();
  });

  it('switches to the Roster tab and removes a non-owner after confirming', async () => {
    mockedOrgApi.removeFromGuildRoster.mockResolvedValue(undefined);
    mockedOrgApi.getMyGuild
      .mockResolvedValueOnce(detail as any)
      .mockResolvedValueOnce({ ...detail, roster: [detail.roster[0]] } as any);
    render(<GuildScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Alpha Squad');

    await act(async () => {
      fireEvent.press(screen.getByText('Roster'));
    });
    await screen.findByText(/Teammate/);

    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const confirm = buttons?.find((b) => b.text === 'Remove');
      confirm?.onPress?.(undefined as any);
    });

    await act(async () => {
      fireEvent.press(screen.getByText('Remove'));
    });

    expect(mockedOrgApi.removeFromGuildRoster).toHaveBeenCalledWith('user-2');
    await screen.findByText('TM · Teammate removed from roster');
    await waitFor(() => expect(screen.queryByText('TM · Teammate')).toBeNull());
  });

  it('never shows a Remove action for the owner or for the current user', async () => {
    render(<GuildScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Alpha Squad');

    await act(async () => {
      fireEvent.press(screen.getByText('Roster'));
    });
    await screen.findByText(/Owner Coach/);

    // Only Teammate (not the owner, not the current user id 'user-1') gets Remove.
    expect(screen.getAllByText('Remove')).toHaveLength(1);
  });
});
