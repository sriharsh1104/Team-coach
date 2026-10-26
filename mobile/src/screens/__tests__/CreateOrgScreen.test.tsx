import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { CreateOrgScreen } from '../CreateOrgScreen';
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

describe('CreateOrgScreen', () => {
  it('blocks submission until a name is entered', async () => {
    mockedUseAuth.mockReturnValue({ setOrg: jest.fn() });
    render(<CreateOrgScreen navigation={navigation} route={{} as any} />);

    await pressAndSettle('Create Org');
    expect(mockedOrgApi.createOrg).not.toHaveBeenCalled();
  });

  it('defaults to COACH, and switches to PLAYER when tapped', async () => {
    mockedUseAuth.mockReturnValue({ setOrg: jest.fn() });
    mockedOrgApi.createOrg.mockResolvedValue({
      id: 'org-1',
      name: 'Alpha Squad',
      orgCode: 'ABC123',
      referralLink: 'token123',
      myRole: 'PLAYER',
    });
    render(<CreateOrgScreen navigation={navigation} route={{} as any} />);

    fireEvent.changeText(screen.getByPlaceholderText('Org / team name'), 'Alpha Squad');
    fireEvent.press(screen.getByText('Player'));
    await pressAndSettle('Create Org');

    expect(mockedOrgApi.createOrg).toHaveBeenCalledWith('Alpha Squad', 'PLAYER');
  });

  it('trims the org name and calls setOrg with the created org on success', async () => {
    const setOrg = jest.fn();
    mockedUseAuth.mockReturnValue({ setOrg });
    mockedOrgApi.createOrg.mockResolvedValue({
      id: 'org-1',
      name: 'Alpha Squad',
      orgCode: 'ABC123',
      referralLink: 'token123',
      myRole: 'COACH',
    });
    render(<CreateOrgScreen navigation={navigation} route={{} as any} />);

    fireEvent.changeText(screen.getByPlaceholderText('Org / team name'), '  Alpha Squad  ');
    await pressAndSettle('Create Org');

    expect(mockedOrgApi.createOrg).toHaveBeenCalledWith('Alpha Squad', 'COACH');
    expect(setOrg).toHaveBeenCalledWith({ id: 'org-1', name: 'Alpha Squad', role: 'COACH' });
  });

  it('shows an alert and does not call setOrg when creation fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const setOrg = jest.fn();
    mockedUseAuth.mockReturnValue({ setOrg });
    mockedOrgApi.createOrg.mockRejectedValue({
      response: { data: { message: 'You already belong to an org' } },
    });
    render(<CreateOrgScreen navigation={navigation} route={{} as any} />);

    fireEvent.changeText(screen.getByPlaceholderText('Org / team name'), 'Alpha Squad');
    await pressAndSettle('Create Org');

    expect(alertSpy).toHaveBeenCalledWith('Could not create org', 'You already belong to an org');
    expect(setOrg).not.toHaveBeenCalled();
  });
});
