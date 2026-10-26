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

  it('defaults to joining as Player, and the toggle switches to Coach and back', async () => {
    mockedUseAuth.mockReturnValue({ setOrg: jest.fn() });
    mockedOrgApi.joinOrg.mockResolvedValue({
      id: 'org-1',
      name: 'Alpha Squad',
      orgCode: '75HCP3',
      referralLink: 'token',
      myRole: 'PLAYER',
    });
    render(<JoinOrgScreen navigation={navigation} route={{} as any} />);

    expect(screen.getByText('Joining as: Player (tap to switch)')).toBeTruthy();

    fireEvent.press(screen.getByText('Joining as: Player (tap to switch)'));
    expect(screen.getByText('Joining as: Coach (tap to switch)')).toBeTruthy();

    fireEvent.changeText(screen.getByPlaceholderText('Org code (e.g. 75HCP3)'), '75HCP3');
    await pressAndSettle('Join');

    expect(mockedOrgApi.joinOrg).toHaveBeenCalledWith('COACH', { orgCode: '75HCP3' });
  });

  it('trims the org code and calls setOrg with the joined org on success', async () => {
    const setOrg = jest.fn();
    mockedUseAuth.mockReturnValue({ setOrg });
    mockedOrgApi.joinOrg.mockResolvedValue({
      id: 'org-1',
      name: 'Alpha Squad',
      orgCode: '75HCP3',
      referralLink: 'token',
      myRole: 'PLAYER',
    });
    render(<JoinOrgScreen navigation={navigation} route={{} as any} />);

    fireEvent.changeText(screen.getByPlaceholderText('Org code (e.g. 75HCP3)'), '  75HCP3  ');
    await pressAndSettle('Join');

    expect(mockedOrgApi.joinOrg).toHaveBeenCalledWith('PLAYER', { orgCode: '75HCP3' });
    expect(setOrg).toHaveBeenCalledWith({ id: 'org-1', name: 'Alpha Squad', role: 'PLAYER' });
  });

  it('shows an alert and does not call setOrg on an invalid code (e.g. 5-player cap or unknown code)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const setOrg = jest.fn();
    mockedUseAuth.mockReturnValue({ setOrg });
    mockedOrgApi.joinOrg.mockRejectedValue({
      response: { data: { message: 'This org already has the maximum of 5 players' } },
    });
    render(<JoinOrgScreen navigation={navigation} route={{} as any} />);

    fireEvent.changeText(screen.getByPlaceholderText('Org code (e.g. 75HCP3)'), '75HCP3');
    await pressAndSettle('Join');

    expect(alertSpy).toHaveBeenCalledWith(
      'Could not join org',
      'This org already has the maximum of 5 players',
    );
    expect(setOrg).not.toHaveBeenCalled();
  });
});
