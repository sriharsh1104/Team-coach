import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { MembersScreen } from '../MembersScreen';
import * as orgApi from '../../api/org';

jest.mock('../../api/org');

const mockedOrgApi = orgApi as jest.Mocked<typeof orgApi>;
const navigation = {
  navigate: jest.fn(),
  push: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
} as any;

const detail = {
  id: 'org-1',
  name: 'Alpha Squad',
  orgCode: 'GUILDCODE',
  referralLink: 'https://team-coach.app/join/guildtoken',
  rosterCode: 'ROSTER01',
  rosterReferralLink:
    'https://team-coach.app/join/rostertoken?seat=roster&ref=user-1',
  canInviteRoster: true,
  myRole: 'COACH',
  isOwner: true,
  historyVisibleToNewMembers: true,
  members: [
    {
      userId: 'user-1',
      name: 'Owner Coach',
      avatarUrl: null,
      role: 'COACH',
      isOwner: true,
      inGameRoles: ['IGL'],
    },
    {
      userId: 'user-2',
      name: 'Teammate',
      avatarUrl: null,
      role: 'PLAYER',
      isOwner: false,
      inGameRoles: [],
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedOrgApi.getMyOrg.mockResolvedValue(detail as any);
});

describe('MembersScreen', () => {
  it('numbers each member, and shows "(Owner)" next to the owner only', async () => {
    render(<MembersScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('1. Owner Coach (Owner)');
    expect(screen.getByText('2. Teammate')).toBeTruthy();
  });

  it('does not repeat the "Roster" heading — the nav bar already shows it', async () => {
    render(<MembersScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('2. Teammate');
    expect(screen.queryByText('Roster')).toBeNull();
  });

  it('shows esports roster invite with a code distinct from the guild code', async () => {
    render(<MembersScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('Esports Roster Invite');
    expect(screen.getByText('ROSTER01')).toBeTruthy();
    expect(screen.queryByText('GUILDCODE')).toBeNull();
    expect(
      screen.getByText(
        'https://team-coach.app/join/rostertoken?seat=roster&ref=user-1',
      ),
    ).toBeTruthy();
  });

  it('hides roster invite for players who cannot invite', async () => {
    mockedOrgApi.getMyOrg.mockResolvedValue({
      ...detail,
      canInviteRoster: false,
      rosterCode: null,
      rosterReferralLink: null,
      isOwner: false,
      myRole: 'PLAYER',
    } as any);
    render(<MembersScreen navigation={navigation} route={{} as any} />);

    await screen.findByText(/Only the owner or a coach can share roster invites/);
    expect(screen.queryByText('Esports Roster Invite')).toBeNull();
  });

  it('copies the roster code when its Copy button is pressed', async () => {
    render(<MembersScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Esports Roster Invite');

    const copyButtons = screen.getAllByLabelText('Copy');
    await act(async () => {
      fireEvent.press(copyButtons[0]);
    });

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('ROSTER01');
  });

  it('navigates to MemberProfile when a member row is pressed', async () => {
    render(<MembersScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('2. Teammate');

    fireEvent.press(screen.getByText('2. Teammate'));
    expect(navigation.push).toHaveBeenCalledWith('MemberProfile', {
      userId: 'user-2',
      name: 'Teammate',
    });
  });
});
