import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AdminScreen } from '../AdminScreen';
import * as adminApi from '../../../api/admin';
import { ThemeProvider } from '../../../theme/ThemeContext';

jest.mock('../../../api/admin');

const mockedApi = adminApi as jest.Mocked<typeof adminApi>;

const overview = {
  orgs: 3,
  users: 42,
  verifiedUsers: 40,
  admins: 1,
  messages: 12_400,
  scrims: 7,
  newUsersLast7Days: 5,
};

function orgRow(id: string, name: string, over: Partial<adminApi.AdminOrgRow> = {}) {
  return {
    id,
    name,
    createdAt: '2026-01-01T00:00:00.000Z',
    rosterCount: 4,
    guildCount: 9,
    messageCount: 120,
    owner: { id: 'u1', name: 'Rhea', email: 'rhea@example.com' },
    ...over,
  };
}

function renderScreen() {
  return render(
    <ThemeProvider>
      <AdminScreen />
    </ThemeProvider>,
  );
}

/** The search box is debounced — push past it. */
async function settle() {
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
}

describe('AdminScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockedApi.getOverview.mockResolvedValue(overview);
    mockedApi.listOrgs.mockResolvedValue({
      total: 1,
      skip: 0,
      take: 25,
      orgs: [orgRow('org-1', 'Alpha Squad')],
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows platform counts and the org list', async () => {
    renderScreen();
    await settle();

    expect(screen.getByText('Orgs')).toBeTruthy();
    expect(screen.getByText('Alpha Squad')).toBeTruthy();
    expect(screen.getByText(/rhea@example.com/)).toBeTruthy();
  });

  it('abbreviates large counts so a wide number cannot break the row', async () => {
    mockedApi.getOverview.mockResolvedValue({
      ...overview,
      messages: 12_400,
      users: 1_240,
      scrims: 7,
    });
    renderScreen();
    await settle();

    expect(screen.getByText('12k')).toBeTruthy(); // 12_400, no decimal past 10k
    expect(screen.getByText('1.2k')).toBeTruthy(); // 1_240 keeps one
    expect(screen.getByText('7')).toBeTruthy(); // small counts stay exact
  });

  it('shows placeholders, not an empty state, while the first load is in flight', () => {
    renderScreen();
    // No settle() — the request has not resolved yet.
    expect(screen.queryByText('No orgs yet.')).toBeNull();
    expect(screen.getByTestId('skeleton-list', { includeHiddenElements: true })).toBeTruthy();
  });

  it('offers a retry instead of pulsing forever when the load fails', async () => {
    mockedApi.getOverview.mockRejectedValue(new Error('offline'));
    renderScreen();
    await settle();

    const retry = screen.getByLabelText('Try loading again');
    expect(retry).toBeTruthy();

    mockedApi.getOverview.mockResolvedValue(overview);
    await act(async () => fireEvent.press(retry));
    await waitFor(() => expect(screen.getByText('Alpha Squad')).toBeTruthy());
  });

  it('searches with a debounce rather than one request per keystroke', async () => {
    renderScreen();
    await settle();
    mockedApi.listOrgs.mockClear();

    const input = screen.getByLabelText('Search orgs by name');
    fireEvent.changeText(input, 'a');
    fireEvent.changeText(input, 'al');
    fireEvent.changeText(input, 'alp');
    await settle();

    expect(mockedApi.listOrgs).toHaveBeenCalledTimes(1);
    expect(mockedApi.listOrgs).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'alp' }),
    );
  });

  it('says so when a search matches nothing', async () => {
    mockedApi.listOrgs.mockResolvedValue({ total: 0, skip: 0, take: 25, orgs: [] });
    renderScreen();
    await settle();
    fireEvent.changeText(screen.getByLabelText('Search orgs by name'), 'zzz');
    await settle();

    expect(screen.getByText('No orgs match that search.')).toBeTruthy();
  });

  it('expands an org to its roster, and collapses again', async () => {
    mockedApi.getOrg.mockResolvedValue({
      id: 'org-1',
      name: 'Alpha Squad',
      createdAt: '2026-01-01T00:00:00.000Z',
      counts: { guildMembers: 9, messages: 120, scrims: 2, mediaPosts: 3, playerStats: 8 },
      roster: [
        {
          id: 'u1',
          name: 'Rhea',
          email: 'rhea@example.com',
          inGameName: 'SES-RHEA',
          avatarUrl: null,
          lastSeenAt: null,
          role: null,
          isOwner: true,
          joinedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    renderScreen();
    await settle();

    const row = screen.getByLabelText('Alpha Squad, 4 roster members');
    await act(async () => fireEvent.press(row));
    await waitFor(() => expect(screen.getByText(/SES-RHEA/)).toBeTruthy());

    await act(async () => fireEvent.press(row));
    expect(screen.queryByText(/SES-RHEA/)).toBeNull();
  });

  it('pages instead of pulling every org at once', async () => {
    mockedApi.listOrgs.mockResolvedValue({
      total: 30,
      skip: 0,
      take: 25,
      orgs: [orgRow('org-1', 'Alpha Squad')],
    });
    renderScreen();
    await settle();

    const more = screen.getByLabelText('Load more orgs, showing 1 of 30');
    mockedApi.listOrgs.mockResolvedValue({
      total: 30,
      skip: 1,
      take: 25,
      orgs: [orgRow('org-2', 'Bravo Squad')],
    });
    await act(async () => fireEvent.press(more));

    await waitFor(() => expect(screen.getByText('Bravo Squad')).toBeTruthy());
    expect(screen.getByText('Alpha Squad')).toBeTruthy();
  });

  it('hides the pager once everything is shown', async () => {
    renderScreen();
    await settle();
    expect(screen.queryByText(/Load more/)).toBeNull();
  });
});
