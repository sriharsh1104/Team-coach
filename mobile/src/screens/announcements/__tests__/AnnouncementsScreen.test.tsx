import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AnnouncementsScreen } from '../AnnouncementsScreen';
import * as api from '../../../api/announcements';
import { ThemeProvider } from '../../../theme/ThemeContext';
import * as templates from '../savedAnnouncementTemplates';

jest.mock('../../../api/announcements');
jest.mock('../savedAnnouncementTemplates');

const mockedApi = api as jest.Mocked<typeof api>;
const mockedTemplates = templates as jest.Mocked<typeof templates>;

function announcement(over: Partial<api.Announcement> = {}): api.Announcement {
  return {
    id: 'a1',
    title: 'Scrim at 9',
    body: 'Be in voice by 8:45.',
    createdAt: new Date().toISOString(),
    author: { id: 'u1', name: 'Rhea', avatarUrl: null },
    read: false,
    ...over,
  };
}

function listPayload(over: Partial<api.AnnouncementList> = {}): api.AnnouncementList {
  return {
    total: 1,
    skip: 0,
    take: 20,
    unread: 1,
    canPost: false,
    announcements: [announcement()],
    ...over,
  };
}

function renderScreen() {
  return render(
    <ThemeProvider>
      <AnnouncementsScreen />
    </ThemeProvider>,
  );
}

describe('AnnouncementsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.listAnnouncements.mockResolvedValue(listPayload());
    mockedApi.markAllRead.mockResolvedValue({ marked: 1 });
    mockedTemplates.loadSavedAnnouncementTemplates.mockResolvedValue([]);
    mockedTemplates.saveAnnouncementTemplate.mockImplementation(
      async ({ title, body }) => [
        {
          id: 't1',
          title,
          body,
          savedAt: new Date().toISOString(),
        },
      ],
    );
    mockedTemplates.removeSavedAnnouncementTemplate.mockResolvedValue([]);
  });

  it('shows the posts and marks them read on open', async () => {
    renderScreen();

    await waitFor(() => expect(screen.getByText('Scrim at 9')).toBeTruthy());
    expect(screen.getByText('Be in voice by 8:45.')).toBeTruthy();
    await waitFor(() => expect(mockedApi.markAllRead).toHaveBeenCalled());
  });

  // The screen clears the unread count a moment after opening; the markers
  // have to survive that, or they vanish while the person is still reading.
  it('keeps the New marker visible after the read call lands', async () => {
    renderScreen();

    await waitFor(() => expect(mockedApi.markAllRead).toHaveBeenCalled());
    expect(screen.getByText('New')).toBeTruthy();
  });

  it('does not call markAllRead when there is nothing unread', async () => {
    mockedApi.listAnnouncements.mockResolvedValue(
      listPayload({ unread: 0, announcements: [announcement({ read: true })] }),
    );
    renderScreen();

    await waitFor(() => expect(screen.getByText('Scrim at 9')).toBeTruthy());
    expect(mockedApi.markAllRead).not.toHaveBeenCalled();
    expect(screen.queryByText('New')).toBeNull();
  });

  it('hides the composer from an ordinary member', async () => {
    renderScreen();

    await waitFor(() => expect(screen.getByText('Scrim at 9')).toBeTruthy());
    expect(screen.queryByLabelText('Announcement title')).toBeNull();
    expect(
      screen.queryByLabelText('Send announcement to everyone'),
    ).toBeNull();
  });

  it('gives the owner a composer and posts what they typed', async () => {
    mockedApi.listAnnouncements.mockResolvedValue(
      listPayload({ canPost: true, unread: 0 }),
    );
    mockedApi.createAnnouncement.mockResolvedValue(announcement());
    renderScreen();

    const title = await screen.findByLabelText('Announcement title');
    fireEvent.changeText(title, 'Practice moved');
    fireEvent.changeText(
      screen.getByLabelText('Announcement message'),
      'Now at 10pm.',
    );
    await act(async () =>
      fireEvent.press(screen.getByLabelText('Send announcement to everyone')),
    );

    expect(mockedApi.createAnnouncement).toHaveBeenCalledWith({
      title: 'Practice moved',
      body: 'Now at 10pm.',
    });
  });

  it('saves for reuse without sending, and tapping a title fills the inputs', async () => {
    mockedApi.listAnnouncements.mockResolvedValue(
      listPayload({ canPost: true, unread: 0 }),
    );
    mockedTemplates.loadSavedAnnouncementTemplates.mockResolvedValue([
      {
        id: 't-scrim',
        title: 'Scrim tonight',
        body: 'Be in voice by 8:45.',
        savedAt: new Date().toISOString(),
      },
    ]);
    renderScreen();

    const useSaved = await screen.findByLabelText(
      'Use saved announcement Scrim tonight',
    );
    fireEvent.press(useSaved);

    expect(screen.getByDisplayValue('Scrim tonight')).toBeTruthy();
    expect(screen.getByDisplayValue('Be in voice by 8:45.')).toBeTruthy();
    expect(mockedApi.createAnnouncement).not.toHaveBeenCalled();

    fireEvent.changeText(
      screen.getByLabelText('Announcement title'),
      'Practice moved',
    );
    fireEvent.changeText(
      screen.getByLabelText('Announcement message'),
      'Now at 10pm.',
    );
    await act(async () =>
      fireEvent.press(screen.getByLabelText('Save announcement for reuse')),
    );
    expect(mockedTemplates.saveAnnouncementTemplate).toHaveBeenCalledWith({
      title: 'Practice moved',
      body: 'Now at 10pm.',
    });
    expect(mockedApi.createAnnouncement).not.toHaveBeenCalled();
  });

  it('will not send a half-filled announcement', async () => {
    mockedApi.listAnnouncements.mockResolvedValue(
      listPayload({ canPost: true, unread: 0 }),
    );
    renderScreen();

    const title = await screen.findByLabelText('Announcement title');
    fireEvent.changeText(title, 'Title only');
    await act(async () =>
      fireEvent.press(screen.getByLabelText('Send announcement to everyone')),
    );

    expect(mockedApi.createAnnouncement).not.toHaveBeenCalled();
  });

  it('offers a retry instead of an empty list when loading fails', async () => {
    mockedApi.listAnnouncements.mockRejectedValue(new Error('offline'));
    renderScreen();

    const retry = await screen.findByLabelText('Try loading again');
    expect(retry).toBeTruthy();

    mockedApi.listAnnouncements.mockResolvedValue(listPayload());
    await act(async () => fireEvent.press(retry));
    await waitFor(() => expect(screen.getByText('Scrim at 9')).toBeTruthy());
  });

  it('says to join a guild when the person has none', async () => {
    mockedApi.listAnnouncements.mockRejectedValue({ response: { status: 404 } });
    renderScreen();

    await waitFor(() =>
      expect(
        screen.getByText('Join a guild to see its announcements.'),
      ).toBeTruthy(),
    );
  });
});
