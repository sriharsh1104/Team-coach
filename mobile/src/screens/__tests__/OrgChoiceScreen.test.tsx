import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { OrgChoiceScreen } from '../OrgChoiceScreen';
import { useAuth } from '../../auth/AuthContext';
import * as orgApi from '../../api/org';

jest.mock('../../auth/AuthContext');
jest.mock('../../api/org');
jest.mock('../../invite/inviteLinks', () => ({
  usePendingInvite: () => null,
}));

const mockedUseAuth = useAuth as jest.Mock;
const mockedOrgApi = orgApi as jest.Mocked<typeof orgApi>;
const navigation = { navigate: jest.fn() } as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockedOrgApi.browseGuilds.mockResolvedValue({
    guilds: [
      {
        id: 'org-1',
        name: 'Sacred Esports',
        memberCount: 12,
        rosterCount: 5,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  });
  mockedUseAuth.mockReturnValue({
    user: { name: 'Player One' },
    logout: jest.fn(),
    setGuild: jest.fn(),
    refreshOrg: jest.fn(),
  });
});

describe('OrgChoiceScreen', () => {
  it('greets the user by name and lists browsable guilds', async () => {
    render(<OrgChoiceScreen navigation={navigation} route={{} as any} />);
    expect(screen.getByText('Welcome, Player One')).toBeTruthy();
    await screen.findByText('Sacred Esports');
    expect(screen.getByText(/12 guild members/)).toBeTruthy();
  });

  it('navigates to CreateOrg and Join with Code', async () => {
    render(<OrgChoiceScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Sacred Esports');

    fireEvent.press(screen.getByText('Create a Org'));
    expect(navigation.navigate).toHaveBeenCalledWith('CreateOrg');

    fireEvent.press(screen.getByText('Join with Code'));
    expect(navigation.navigate).toHaveBeenCalledWith('JoinOrg');
  });

  it('joins a guild from the browse list', async () => {
    const setGuild = jest.fn();
    const refreshOrg = jest.fn();
    mockedUseAuth.mockReturnValue({
      user: { name: 'Player One' },
      logout: jest.fn(),
      setGuild,
      refreshOrg,
    });
    mockedOrgApi.joinGuild.mockResolvedValue({
      id: 'org-1',
      name: 'Sacred Esports',
      role: 'MEMBER',
    });
    render(<OrgChoiceScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Sacred Esports');
    fireEvent.press(screen.getByText('Join Guild'));
    await waitFor(() =>
      expect(mockedOrgApi.joinGuild).toHaveBeenCalledWith({ orgId: 'org-1' }),
    );
    expect(setGuild).toHaveBeenCalled();
    expect(refreshOrg).toHaveBeenCalled();
  });

  it('calls logout when the link is pressed', async () => {
    const logout = jest.fn();
    mockedUseAuth.mockReturnValue({
      user: { name: 'Player One' },
      logout,
      setGuild: jest.fn(),
      refreshOrg: jest.fn(),
    });
    render(<OrgChoiceScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Sacred Esports');

    fireEvent.press(screen.getByText('Log Out'));
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
