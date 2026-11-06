import React from 'react';
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
});

describe('CreateOrgScreen', () => {
  it('navigates back to OrgChoice', async () => {
    mockedUseAuth.mockReturnValue({ setOrg: jest.fn() });
    render(<CreateOrgScreen navigation={navigation} route={{} as any} />);

    await pressAndSettle('Back');
    expect(navigation.navigate).toHaveBeenCalledWith('OrgChoice');
  });

  it('blocks submission until a name is entered', async () => {
    mockedUseAuth.mockReturnValue({ setOrg: jest.fn() });
    render(<CreateOrgScreen navigation={navigation} route={{} as any} />);

    await pressAndSettle('Create Org');
    expect(mockedOrgApi.createOrg).not.toHaveBeenCalled();
  });

  it('trims the org name, shows the shareable code, and hands off to setOrg on Continue', async () => {
    const setOrg = jest.fn();
    mockedUseAuth.mockReturnValue({ setOrg });
    mockedOrgApi.createOrg.mockResolvedValue({
      id: 'org-1',
      name: 'Alpha Squad',
      orgCode: 'ABC123',
      referralLink: 'token123',
      rosterCode: 'XYZ789',
      rosterReferralLink: 'roster-token123',
      myRole: null,
      isOwner: true,
    });
    render(<CreateOrgScreen navigation={navigation} route={{} as any} />);

    fireEvent.changeText(screen.getByPlaceholderText('Org / team name'), '  Alpha Squad  ');
    await pressAndSettle('Create Org');

    expect(mockedOrgApi.createOrg).toHaveBeenCalledWith('Alpha Squad');
    expect(screen.getByText('ABC123')).toBeTruthy();
    expect(setOrg).not.toHaveBeenCalled();

    await pressAndSettle('Continue');

    expect(setOrg).toHaveBeenCalledWith({
      id: 'org-1',
      name: 'Alpha Squad',
      role: null,
      isOwner: true,
    });
  });

  it('does not call setOrg when creation fails (API toaster owns the message)', async () => {
    const setOrg = jest.fn();
    mockedUseAuth.mockReturnValue({ setOrg });
    mockedOrgApi.createOrg.mockRejectedValue({
      response: { data: { message: 'You already belong to an org' } },
    });
    render(<CreateOrgScreen navigation={navigation} route={{} as any} />);

    fireEvent.changeText(screen.getByPlaceholderText('Org / team name'), 'Alpha Squad');
    await pressAndSettle('Create Org');

    expect(setOrg).not.toHaveBeenCalled();
  });
});
