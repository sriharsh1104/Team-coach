import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AdminScreen } from '../AdminScreen';
import * as adminApi from '../../../api/admin';
import { ThemeProvider } from '../../../theme/ThemeContext';

jest.mock('../../../api/admin');
// confirmAsync falls through to Alert.alert on native, which never invokes a
// button under Jest — so the promise would hang and leak into the next test.
jest.mock('../../../ui/confirmAsync', () => ({
  confirmAsync: jest.fn().mockResolvedValue(true),
}));

const mockedApi = adminApi as jest.Mocked<typeof adminApi>;

const overview: adminApi.AdminOverview = {
  orgs: 3,
  users: 42,
  verifiedUsers: 40,
  admins: 1,
  messages: 12_400,
  scrims: 7,
  newUsersLast7Days: 5,
  newUsersLast24Hours: 2,
  guildMembers: 30,
  rosterMembers: 11,
  activeUsers24h: 9,
  activeUsers7d: 21,
  activeUsers30d: 35,
  onlineNow: 4,
  pendingJoinRequests: 0,
};

const health: adminApi.AdminHealth = {
  checkedAt: '2026-01-01T00:00:00.000Z',
  status: 'ok',
  needsAttention: 0,
  process: {
    env: 'test',
    nodeVersion: 'v22.0.0',
    uptimeSeconds: 120,
    startedAt: '2026-01-01T00:00:00.000Z',
    memoryMb: 100,
    heapUsedMb: 40,
  },
  services: [
    {
      key: 'database',
      label: 'PostgreSQL',
      status: 'up',
      kind: 'live',
      detail: 'Query answered',
      latencyMs: 2,
    },
  ],
};

function member(
  over: Partial<adminApi.AdminMember> = {},
): adminApi.AdminMember {
  return {
    id: 'u1',
    name: 'Rhea',
    email: 'rhea@example.com',
    guildRole: 'MEMBER',
    rosterRole: null,
    onRoster: false,
    inGuild: true,
    blockedAt: null,
    blockedReason: null,
    canDirectVoice: false,
    isOwner: false,
    ...over,
  };
}

function orgRow(
  id: string,
  name: string,
  over: Partial<adminApi.AdminOrgRow> = {},
): adminApi.AdminOrgRow {
  return {
    id,
    name,
    orgCode: 'CODE123',
    createdAt: '2026-01-01T00:00:00.000Z',
    rosterCount: 4,
    guildCount: 9,
    messageCount: 120,
    owner: { id: 'u1', name: 'Rhea', email: 'rhea@example.com' },
    ...over,
  };
}

/** One guild with two people, both holding both seats. */
function orgDetail(): adminApi.AdminOrgDetail {
  return {
    id: 'org-1',
    name: 'Alpha Squad',
    orgCode: 'CODE123',
    rosterCode: 'ROST123',
    createdAt: '2026-01-01T00:00:00.000Z',
    owner: { id: 'u1', name: 'Rhea', email: 'rhea@example.com' },
    counts: {
      guildMembers: 9,
      rosterMembers: 1,
      activeGuildMembers24h: 3,
      messages: 120,
      scrims: 2,
      mediaPosts: 3,
      playerStats: 8,
      pendingJoinRequests: 0,
    },
    members: [
      member({ id: 'g1', name: 'Vik' }),
      member({ isOwner: true, onRoster: true }),
    ],
    pendingRequests: [],
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

/**
 * The screen opens on Overview now; guilds live behind their own tab. Every
 * test that cares about the list has to get there first — which is itself
 * worth asserting, since the tab is the only route to it.
 */
async function openGuildsTab() {
  await act(async () => fireEvent.press(screen.getByLabelText('Guilds')));
  await settle();
}

describe('AdminScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockedApi.getOverview.mockResolvedValue(overview);
    mockedApi.getHealth.mockResolvedValue(health);
    mockedApi.listDirectVoiceUsers.mockResolvedValue([]);
    mockedApi.getOrg.mockResolvedValue(orgDetail());
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

  it('opens on the overview counts, not on a wall of everything', async () => {
    renderScreen();
    await settle();

    expect(screen.getByText('Total users')).toBeTruthy();
    expect(screen.getByText('Online now')).toBeTruthy();
    // The guild list is a tab away — the whole point of the split.
    expect(screen.queryByText('Alpha Squad')).toBeNull();
  });

  it('shows the guild list once that tab is open', async () => {
    renderScreen();
    await settle();
    await openGuildsTab();

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
    // No settle() — the request has not resolved yet. The overview tab shows
    // placeholder dashes in every stat card rather than zeroes, which would
    // read as "this platform has nobody on it".
    expect(screen.queryByText('No guilds yet.')).toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('offers a retry instead of pulsing forever when the load fails', async () => {
    mockedApi.getOverview.mockRejectedValue(new Error('offline'));
    renderScreen();
    await settle();
    await openGuildsTab();

    const retry = screen.getByLabelText('Try loading again');
    expect(retry).toBeTruthy();

    mockedApi.getOverview.mockResolvedValue(overview);
    await act(async () => fireEvent.press(retry));
    await waitFor(() => expect(screen.getByText('Alpha Squad')).toBeTruthy());
  });

  it('searches with a debounce rather than one request per keystroke', async () => {
    renderScreen();
    await settle();
    await openGuildsTab();
    mockedApi.listOrgs.mockClear();

    const input = screen.getByLabelText('Search guilds');
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
    await openGuildsTab();
    fireEvent.changeText(screen.getByLabelText('Search guilds'), 'zzz');
    await settle();

    expect(screen.getByText('No guilds match that search.')).toBeTruthy();
  });

  it('expands an org to its roster, and collapses again', async () => {
    mockedApi.getOrg.mockResolvedValue({
      id: 'org-1',
      name: 'Alpha Squad',
      orgCode: 'CODE123',
      rosterCode: 'ROST123',
      createdAt: '2026-01-01T00:00:00.000Z',
      owner: { id: 'u1', name: 'Rhea', email: 'rhea@example.com' },
      counts: {
        guildMembers: 9,
        rosterMembers: 1,
        activeGuildMembers24h: 3,
        messages: 120,
        scrims: 2,
        mediaPosts: 3,
        playerStats: 8,
        pendingJoinRequests: 0,
      },
      members: [
        member({ id: 'g1', name: 'Vik' }),
        member({ isOwner: true, onRoster: true }),
      ],
      pendingRequests: [],
    });
    renderScreen();
    await settle();
    await openGuildsTab();

    const row = screen.getByLabelText('Alpha Squad, 4 roster members');
    await act(async () => fireEvent.press(row));
    await waitFor(() => expect(screen.getByText('Vik')).toBeTruthy());

    await act(async () => fireEvent.press(row));
    expect(screen.queryByText('Vik')).toBeNull();
  });

  it('grants 1-on-1 voice from a member row and re-reads the guild afterwards', async () => {
    mockedApi.setDirectVoice.mockResolvedValue({
      userId: 'g1',
      email: 'vik@example.com',
      canDirectVoice: true,
    });
    renderScreen();
    await settle();
    await openGuildsTab();

    await act(async () =>
      fireEvent.press(screen.getByLabelText('Alpha Squad, 4 roster members')),
    );
    const chip = await screen.findByLabelText(
      'Grant 1-on-1 voice for Vik',
    );
    await act(async () => fireEvent.press(chip));

    expect(mockedApi.setDirectVoice).toHaveBeenCalledWith({
      userId: 'g1',
      enabled: true,
    });
    // The row must come from the server, never from a local guess about
    // whether the write landed.
    expect(mockedApi.getOrg).toHaveBeenCalledTimes(2);
  });

  it('shows each member once with the seats they hold, not two lists', async () => {
    renderScreen();
    await settle();
    await openGuildsTab();
    await act(async () =>
      fireEvent.press(screen.getByLabelText('Alpha Squad, 4 roster members')),
    );

    // Two people, two rows — the old build listed guild and roster separately
    // and showed the same person twice.
    await waitFor(() => expect(screen.getByText('Vik')).toBeTruthy());
    expect(screen.getByText(/Members \(2\)/)).toBeTruthy();
    expect(screen.queryByText(/^Roster \(/)).toBeNull();
  });

  it('offers block and delete on a member, and blocks on confirm', async () => {
    mockedApi.blockUser.mockResolvedValue({
      id: 'g1',
      email: 'vik@example.com',
      blockedAt: '2026-01-02T00:00:00.000Z',
    });
    renderScreen();
    await settle();
    await openGuildsTab();
    await act(async () =>
      fireEvent.press(screen.getByLabelText('Alpha Squad, 4 roster members')),
    );

    const block = await screen.findByLabelText('Block Vik');
    expect(screen.getByLabelText('Delete account Vik')).toBeTruthy();

    await act(async () => fireEvent.press(block));
    expect(mockedApi.blockUser).toHaveBeenCalledWith('g1');
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
    await openGuildsTab();

    const more = screen.getByLabelText('Load more guilds, showing 1 of 30');
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
    await openGuildsTab();
    expect(screen.queryByText(/Load more/)).toBeNull();
  });
});
