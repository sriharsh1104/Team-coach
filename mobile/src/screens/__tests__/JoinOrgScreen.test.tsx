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

async function pressAndSettle(text: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(text));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('JoinOrgScreen', () => {
  it('blocks submission until an org code is entered', async () => {
    mockedUseAuth.mockReturnValue({ setOrg: jest.fn() });
    render(<JoinOrgScreen navigation={navigation} route={{} as any} />);

    await pressAndSettle('Join');
    expect(mockedOrgApi.joinOrg).not.toHaveBeenCalled();
  });

  it('does not offer a role picker — joiners are always players', async () => {
    mockedUseAuth.mockReturnValue({ setOrg: jest.fn() });
    render(<JoinOrgScreen navigation={navigation} route={{} as any} />);

    expect(screen.queryByText('Coach')).toBeNull();
    expect(screen.queryByText('Analyst')).toBeNull();
    expect(
      screen.getByText(
        'You join as a Player. The org owner can promote you to Coach or Analyst.',
      ),
    ).toBeTruthy();
  });

  it('joins with only the org code and calls setOrg on success', async () => {
    const setOrg = jest.fn();
    mockedUseAuth.mockReturnValue({ setOrg });
    mockedOrgApi.joinOrg.mockResolvedValue({
      id: 'org-1',
      name: 'Alpha Squad',
      orgCode: '75HCP3',
      referralLink: 'token',
      myRole: 'PLAYER',
      isOwner: false,
    });
    render(<JoinOrgScreen navigation={navigation} route={{} as any} />);

    fireEvent.changeText(screen.getByPlaceholderText('Org code or invite link'), '  75HCP3  ');
    await pressAndSettle('Join');

    expect(mockedOrgApi.joinOrg).toHaveBeenCalledWith({ orgCode: '75HCP3' });
    expect(setOrg).toHaveBeenCalledWith({
      id: 'org-1',
      name: 'Alpha Squad',
      role: 'PLAYER',
      isOwner: false,
    });
  });

  it('joins with a pasted referral link/token (longer than a 6-char org code)', async () => {
    const setOrg = jest.fn();
    mockedUseAuth.mockReturnValue({ setOrg });
    mockedOrgApi.joinOrg.mockResolvedValue({
      id: 'org-1',
      name: 'Alpha Squad',
      orgCode: '75HCP3',
      referralLink: '7vrQ3WST1LbnAM0ziUcBGrUk',
      myRole: 'PLAYER',
      isOwner: false,
    });
    render(<JoinOrgScreen navigation={navigation} route={{} as any} />);

    fireEvent.changeText(
      screen.getByPlaceholderText('Org code or invite link'),
      '  7vrQ3WST1LbnAM0ziUcBGrUk  ',
    );
    await pressAndSettle('Join');

    expect(mockedOrgApi.joinOrg).toHaveBeenCalledWith({
      referralToken: '7vrQ3WST1LbnAM0ziUcBGrUk',
    });
  });

  it('shows an alert and does not call setOrg on failure', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const setOrg = jest.fn();
    mockedUseAuth.mockReturnValue({ setOrg });
    mockedOrgApi.joinOrg.mockRejectedValue({
      response: { data: { message: 'This org already has the maximum of 5 players' } },
    });
    render(<JoinOrgScreen navigation={navigation} route={{} as any} />);

    fireEvent.changeText(screen.getByPlaceholderText('Org code or invite link'), '75HCP3');
    await pressAndSettle('Join');

    expect(alertSpy).toHaveBeenCalledWith(
      'Could not join org',
      'This org already has the maximum of 5 players',
    );
    expect(setOrg).not.toHaveBeenCalled();
  });
});
