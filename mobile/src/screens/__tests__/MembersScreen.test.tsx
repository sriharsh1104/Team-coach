import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { MembersScreen } from '../MembersScreen';
import * as orgApi from '../../api/org';

jest.mock('../../api/org');

const mockedOrgApi = orgApi as jest.Mocked<typeof orgApi>;
const navigation = { navigate: jest.fn() } as any;

const detail = {
  id: 'org-1',
  name: 'Alpha Squad',
  orgCode: '75HCP3',
  referralLink: 'https://team-coach.app/join/token',
  myRole: 'COACH',
  isOwner: true,
  members: [
    { userId: 'user-1', name: 'Owner Coach', avatarUrl: null, role: 'COACH', isOwner: true, inGameRoles: ['IGL'] },
    { userId: 'user-2', name: 'Teammate', avatarUrl: null, role: 'PLAYER', isOwner: false, inGameRoles: [] },
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
    expect(screen.queryByText('2. Teammate (Owner)')).toBeNull();
  });

  it('does not repeat the "Team Members" heading — the nav bar already shows it', async () => {
    render(<MembersScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('2. Teammate');

    expect(screen.queryByText('Team Members')).toBeNull();
  });

  it('shows each member\'s role', async () => {
    render(<MembersScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('2. Teammate');
    expect(screen.getByText('COACH')).toBeTruthy();
    expect(screen.getByText('PLAYER')).toBeTruthy();
  });

  it('shows in-game role tags next to the org role, and nothing extra when a member has none set', async () => {
    render(<MembersScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('2. Teammate');
    expect(screen.getByText('IGL')).toBeTruthy();
  });

  it('navigates to MemberProfile when a member row is pressed', async () => {
    render(<MembersScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('2. Teammate');

    fireEvent.press(screen.getByText('2. Teammate'));
    expect(navigation.navigate).toHaveBeenCalledWith('MemberProfile', {
      userId: 'user-2',
      name: 'Teammate',
    });
  });

  it('is a pure roster viewer — no role-change, remove, or ownership-transfer actions (those moved to Org Settings)', async () => {
    render(<MembersScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('2. Teammate');

    expect(screen.queryByText('Change Role')).toBeNull();
    expect(screen.queryByText('Make Owner')).toBeNull();
    expect(screen.queryByText('Remove')).toBeNull();
  });

  describe('invite section', () => {
    it('shows the org code and invite link so the org can be shared', async () => {
      render(<MembersScreen navigation={navigation} route={{} as any} />);

      await screen.findByText('Invite Players');
      expect(screen.getByText('75HCP3')).toBeTruthy();
      expect(screen.getByText('https://team-coach.app/join/token')).toBeTruthy();
    });

    it('copies the org code when its Copy button is pressed', async () => {
      render(<MembersScreen navigation={navigation} route={{} as any} />);
      await screen.findByText('Invite Players');

      const copyButtons = screen.getAllByLabelText('Copy');
      await act(async () => {
        fireEvent.press(copyButtons[0]); // Org Code row is first
      });

      expect(Clipboard.setStringAsync).toHaveBeenCalledWith('75HCP3');
    });

    it('copies the invite link when its Copy button is pressed', async () => {
      render(<MembersScreen navigation={navigation} route={{} as any} />);
      await screen.findByText('Invite Players');

      const copyButtons = screen.getAllByLabelText('Copy');
      await act(async () => {
        fireEvent.press(copyButtons[1]); // Invite Link row is second
      });

      expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
        'https://team-coach.app/join/token',
      );
    });
  });
});
