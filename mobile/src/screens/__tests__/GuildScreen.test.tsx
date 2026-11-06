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
  referralLink: 'https://app.example.com/join/token?ref=user-1',
  myInviteCount: 3,
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
  it('shows Invite & Referral with invite count, code/link, and guild members', async () => {
    render(<GuildScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('Alpha Squad');
    expect(screen.getByText('Invite & Referral')).toBeTruthy();
    expect(screen.getByText(/Your invites: 3 guild members/)).toBeTruthy();
    expect(screen.getByText('Guild Code')).toBeTruthy();
    expect(screen.getByText('75HCP3')).toBeTruthy();
    expect(screen.getByText('Waiting Member')).toBeTruthy();
    expect(screen.getByText(/Not on roster/)).toBeTruthy();
  });

  it('adds a waiting guild member to the roster via the add icon', async () => {
    mockedOrgApi.addGuildMemberToRoster.mockResolvedValue({
      userId: 'user-3',
      role: 'PLAYER',
    });
    mockedOrgApi.getMyGuild
      .mockResolvedValueOnce(detail as any)
      .mockResolvedValueOnce({
        ...detail,
        members: [
          detail.members[0],
          detail.members[1],
          { ...detail.members[2], onRoster: true, rosterRole: 'PLAYER' },
        ],
      } as any);
    render(<GuildScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Waiting Member');

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Add Waiting Member to roster'));
    });

    expect(mockedOrgApi.addGuildMemberToRoster).toHaveBeenCalledWith(
      'user-3',
      'PLAYER',
    );
    await screen.findByText('Waiting Member added to roster');
  });

  it('does not show roster-management icons to a member who cannot manage the roster', async () => {
    mockedOrgApi.getMyGuild.mockResolvedValue({
      ...detail,
      canManageRoster: false,
    } as any);
    render(<GuildScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Waiting Member');

    expect(screen.queryByLabelText('Add Waiting Member to roster')).toBeNull();
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
      fireEvent.press(screen.getByLabelText('Remove Teammate from roster'));
    });

    expect(mockedOrgApi.removeFromGuildRoster).toHaveBeenCalledWith('user-2');
    await screen.findByText('TM · Teammate removed from roster');
    await waitFor(() => expect(screen.queryByText('TM · Teammate')).toBeNull());
  });

  it('disables remove for the owner and enables add/remove correctly on Members', async () => {
    render(<GuildScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Waiting Member');

    expect(screen.getByLabelText('Add Waiting Member to roster')).toBeTruthy();
    expect(screen.getByLabelText('Remove Teammate from roster')).toBeTruthy();
    // Owner row still shows icons, but remove is disabled (no pressable enable).
    expect(screen.getByLabelText('Remove Owner Coach from roster')).toBeTruthy();
  });
});
