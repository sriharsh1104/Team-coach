import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { JoinOrgScreen } from '../JoinOrgScreen';
import { useAuth } from '../../auth/AuthContext';
import * as orgApi from '../../api/org';

jest.mock('../../auth/AuthContext');
jest.mock('../../api/org');

const mockedUseAuth = useAuth as jest.Mock;
const mockedOrgApi = orgApi as jest.Mocked<typeof orgApi>;
const navigation = { navigate: jest.fn() } as any;

async function pressJoinButton() {
  await act(async () => {
    // Title and button both say "Join" — press the SoftPressable via the glyph row.
    const matches = screen.getAllByText('Join');
    fireEvent.press(matches[matches.length - 1]);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('JoinOrgScreen', () => {
  it('joins guild with a guild code', async () => {
    const setGuild = jest.fn();
    mockedUseAuth.mockReturnValue({ setGuild, setOrg: jest.fn() });
    mockedOrgApi.joinGuild.mockResolvedValue({
      id: 'org-1',
      name: 'Alpha Squad',
      role: 'MEMBER',
    });
    render(<JoinOrgScreen navigation={navigation} route={{} as any} />);

    fireEvent.changeText(
      screen.getByPlaceholderText('Code or invite link'),
      'GUILDCOD',
    );
    await pressJoinButton();

    expect(mockedOrgApi.joinGuild).toHaveBeenCalledWith({ orgCode: 'GUILDCOD' });
    expect(setGuild).toHaveBeenCalled();
  });

  it('falls back to rosterCode when guild code is not found', async () => {
    const setGuild = jest.fn();
    const setOrg = jest.fn();
    mockedUseAuth.mockReturnValue({ setGuild, setOrg });
    mockedOrgApi.joinGuild.mockRejectedValue({ response: { status: 404 } });
    mockedOrgApi.joinOrg.mockResolvedValue({
      id: 'org-1',
      name: 'Alpha Squad',
      orgCode: 'GUILDCOD',
      referralLink: 'g',
      myRole: 'PLAYER',
      isOwner: false,
    });
    render(<JoinOrgScreen navigation={navigation} route={{} as any} />);

    fireEvent.changeText(
      screen.getByPlaceholderText('Code or invite link'),
      'ROSTER01',
    );
    await pressJoinButton();

    expect(mockedOrgApi.joinOrg).toHaveBeenCalledWith({ rosterCode: 'ROSTER01' });
    expect(setOrg).toHaveBeenCalled();
  });

  it('joins roster when the invite URL has seat=roster', async () => {
    const setGuild = jest.fn();
    const setOrg = jest.fn();
    mockedUseAuth.mockReturnValue({ setGuild, setOrg });
    mockedOrgApi.joinOrg.mockResolvedValue({
      id: 'org-1',
      name: 'Alpha Squad',
      orgCode: 'GUILDCOD',
      referralLink: 'g',
      myRole: 'PLAYER',
      isOwner: false,
    });
    render(<JoinOrgScreen navigation={navigation} route={{} as any} />);

    fireEvent.changeText(
      screen.getByPlaceholderText('Code or invite link'),
      'https://app.test/join/rostertoken?seat=roster',
    );
    await pressJoinButton();

    expect(mockedOrgApi.joinOrg).toHaveBeenCalledWith({
      referralToken: 'https://app.test/join/rostertoken?seat=roster',
    });
  });
});
