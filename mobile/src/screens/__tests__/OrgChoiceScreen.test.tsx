import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { OrgChoiceScreen } from '../OrgChoiceScreen';
import { useAuth } from '../../auth/AuthContext';
import * as orgApi from '../../api/org';
import { emitToast } from '../../ui/toastBus';

jest.mock('../../auth/AuthContext');
jest.mock('../../api/org');
jest.mock('../../invite/inviteLinks', () => ({
  usePendingInvite: () => null,
}));
jest.mock('../../ui/toastBus', () => ({
  emitToast: jest.fn(),
}));

const mockedUseAuth = useAuth as jest.Mock;
const mockedOrgApi = orgApi as jest.Mocked<typeof orgApi>;
const mockedEmitToast = emitToast as jest.Mock;
const navigation = { navigate: jest.fn() } as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockedOrgApi.browseGuilds.mockResolvedValue({
    guilds: [
      {
        id: 'org-1',
        name: 'Sacred Esports',
        logoUrl: null,
        memberCount: 12,
        rosterCount: 5,
        createdAt: '2026-01-01T00:00:00.000Z',
        requestStatus: null,
      },
    ],
  });
  mockedUseAuth.mockReturnValue({
    user: { name: 'Player One' },
    org: null,
    guild: null,
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

  // Joining outright from the public list is gone — the owner has to accept.
  it('sends a join request and flips the row to "waiting"', async () => {
    const setGuild = jest.fn();
    mockedUseAuth.mockReturnValue({
      user: { name: 'Player One' },
      logout: jest.fn(),
      setGuild,
      refreshOrg: jest.fn(),
    });
    mockedOrgApi.requestGuildJoin.mockResolvedValue({
      status: 'PENDING',
      orgId: 'org-1',
      orgName: 'Sacred Esports',
    });
    render(<OrgChoiceScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Sacred Esports');
    fireEvent.press(screen.getByText('Request to Join'));

    await waitFor(() =>
      expect(mockedOrgApi.requestGuildJoin).toHaveBeenCalledWith('org-1'),
    );
    await screen.findByText('Waiting for the owner to accept.');
    // No seat until the owner says yes.
    expect(mockedOrgApi.joinGuild).not.toHaveBeenCalled();
    expect(setGuild).not.toHaveBeenCalled();
  });

  it('shows a guild that already has a pending request as waiting', async () => {
    mockedOrgApi.browseGuilds.mockResolvedValue({
      guilds: [
        {
          id: 'org-1',
          name: 'Sacred Esports',
          logoUrl: null,
          memberCount: 12,
          rosterCount: 5,
          createdAt: '2026-01-01T00:00:00.000Z',
          requestStatus: 'PENDING',
        },
      ],
    });
    render(<OrgChoiceScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Waiting for the owner to accept.');
    expect(screen.queryByText('Request to Join')).toBeNull();
  });

  it('lets a declined request be sent again', async () => {
    mockedOrgApi.browseGuilds.mockResolvedValue({
      guilds: [
        {
          id: 'org-1',
          name: 'Sacred Esports',
          logoUrl: null,
          memberCount: 12,
          rosterCount: 5,
          createdAt: '2026-01-01T00:00:00.000Z',
          requestStatus: 'REJECTED',
        },
      ],
    });
    render(<OrgChoiceScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Ask Again');
    expect(
      screen.getByText('This guild declined — you can ask again.'),
    ).toBeTruthy();
  });

  it('calls logout when the link is pressed', async () => {
    const logout = jest.fn();
    mockedUseAuth.mockReturnValue({
      user: { name: 'Player One' },
      org: null,
      guild: null,
      logout,
      setGuild: jest.fn(),
      refreshOrg: jest.fn(),
    });
    render(<OrgChoiceScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Sacred Esports');

    fireEvent.press(screen.getByText('Log Out'));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('does not toast "leave guild" when browse says the account already has a seat', async () => {
    const refreshOrg = jest.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({
      user: { name: 'Player One' },
      org: null,
      guild: null,
      logout: jest.fn(),
      setGuild: jest.fn(),
      refreshOrg,
    });
    mockedOrgApi.browseGuilds.mockRejectedValue({
      response: {
        status: 409,
        data: { message: 'Leave your current guild before browsing others' },
      },
    });

    render(<OrgChoiceScreen navigation={navigation} route={{} as any} />);

    await waitFor(() => expect(refreshOrg).toHaveBeenCalled());
    expect(mockedEmitToast).not.toHaveBeenCalled();
  });
});
