import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { MembersScreen } from '../MembersScreen';
import * as orgApi from '../../api/org';

jest.mock('../../api/org');

const mockedOrgApi = orgApi as jest.Mocked<typeof orgApi>;
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

beforeEach(() => {
  jest.clearAllMocks();
  mockedOrgApi.getMyOrg.mockResolvedValue(detail as any);
});

describe('MembersScreen', () => {
  it('shows "(Owner)" next to the owner, and not next to other members', async () => {
    render(<MembersScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('Owner Coach (Owner)');
    expect(screen.getByText('Teammate')).toBeTruthy();
    expect(screen.queryByText('Teammate (Owner)')).toBeNull();
  });

  it('shows each member\'s role', async () => {
    render(<MembersScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('Teammate');
    expect(screen.getByText('COACH')).toBeTruthy();
    expect(screen.getByText('PLAYER')).toBeTruthy();
  });

  it('navigates to MemberProfile when a member row is pressed', async () => {
    render(<MembersScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Teammate');

    fireEvent.press(screen.getByText('Teammate'));
    expect(navigation.navigate).toHaveBeenCalledWith('MemberProfile', {
      userId: 'user-2',
      name: 'Teammate',
    });
  });

  it('is a pure roster viewer — no role-change, remove, or ownership-transfer actions (those moved to Org Settings)', async () => {
    render(<MembersScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Teammate');

    expect(screen.queryByText('Change Role')).toBeNull();
    expect(screen.queryByText('Make Owner')).toBeNull();
    expect(screen.queryByText('Remove')).toBeNull();
  });
});
