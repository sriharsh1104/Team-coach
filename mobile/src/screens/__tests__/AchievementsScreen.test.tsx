import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AchievementsScreen } from '../AchievementsScreen';
import * as orgApi from '../../api/org';
import { ThemeProvider } from '../../theme/ThemeContext';

jest.mock('../../api/org');
jest.mock('../../ui/toastBus', () => ({ emitToast: jest.fn() }));

const mockedOrgApi = orgApi as jest.Mocked<typeof orgApi>;

const detail = {
  id: 'org-1',
  name: 'Alpha Squad',
  orgCode: '75HCP3',
  freeFireGuildId: null,
  referralLink: 'https://app.example.com/join/token',
  myInviteCount: 0,
  myGuildRole: 'LEADER',
  onRoster: true,
  canManageRoster: true,
  achievements: [
    {
      id: 'ach-1',
      name: 'FFWS India',
      date: '2025-11-01',
      grandFinalLink: 'https://example.com/gf',
      standing: '1st',
      pointsTableUrl: null,
    },
  ],
  roster: [],
  members: [],
};

function renderScreen() {
  return render(
    <ThemeProvider>
      <AchievementsScreen />
    </ThemeProvider>,
  );
}

describe('AchievementsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedOrgApi.getMyGuild.mockResolvedValue(detail as any);
  });

  it('lists grand finals and shows the owner add form', async () => {
    renderScreen();
    expect(await screen.findByText('FFWS India')).toBeTruthy();
    expect(screen.getByText(/1st/)).toBeTruthy();
    expect(screen.getByLabelText('Add achievement')).toBeTruthy();
  });

  it('hides the add form when the viewer cannot manage the roster', async () => {
    mockedOrgApi.getMyGuild.mockResolvedValue({
      ...detail,
      canManageRoster: false,
    } as any);
    renderScreen();
    await screen.findByText('FFWS India');
    expect(screen.queryByLabelText('Add achievement')).toBeNull();
  });

  it('retries after a failed load', async () => {
    mockedOrgApi.getMyGuild.mockRejectedValueOnce(new Error('offline'));
    renderScreen();
    const retry = await screen.findByLabelText('Try loading again');
    mockedOrgApi.getMyGuild.mockResolvedValue(detail as any);
    await act(async () => fireEvent.press(retry));
    await waitFor(() => expect(screen.getByText('FFWS India')).toBeTruthy());
  });
});
