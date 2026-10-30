import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { MediaFeedScreen } from '../MediaFeedScreen';
import * as mediaApi from '../../../api/media';
import * as orgApi from '../../../api/org';

jest.mock('../../../api/media');
jest.mock('../../../api/org');

const mockedMediaApi = mediaApi as jest.Mocked<typeof mediaApi>;
const mockedOrgApi = orgApi as jest.Mocked<typeof orgApi>;

const navigation = { navigate: jest.fn(), push: jest.fn() } as any;

const org = {
  id: 'org-1',
  name: 'Alpha Squad',
  orgCode: '75HCP3',
  members: [
    { userId: 'user-2', name: 'Player 2', avatarUrl: null, role: 'PLAYER' },
  ],
} as any;

const imagePost = {
  id: 'post-1',
  type: 'IMAGE',
  url: '/media-files/post-1.jpg',
  caption: 'Great round',
  createdAt: '2026-01-01T00:00:00.000Z',
  uploaderId: 'user-2',
  uploaderName: 'Player 2',
} as any;

const videoPost = {
  id: 'post-2',
  type: 'VIDEO',
  url: '/media-files/post-2.mp4',
  caption: null,
  createdAt: '2026-01-02T00:00:00.000Z',
  uploaderId: 'user-2',
  uploaderName: 'Player 2',
} as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockedOrgApi.getMyOrg.mockResolvedValue(org);
  mockedMediaApi.listMedia.mockResolvedValue([imagePost, videoPost]);
});

describe('MediaFeedScreen', () => {
  it('loads members and posts, showing uploader name and caption', async () => {
    render(<MediaFeedScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('Great round');
    expect(screen.getAllByText('Player 2').length).toBeGreaterThan(0);
    expect(mockedMediaApi.listMedia).toHaveBeenCalledWith(undefined);
  });

  it('shows the empty state when there are no posts', async () => {
    mockedMediaApi.listMedia.mockResolvedValue([]);
    render(<MediaFeedScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('No uploads yet.');
  });

  it('filters by uploader when a member chip is pressed', async () => {
    render(<MediaFeedScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Great round');

    await act(async () => {
      fireEvent.press(screen.getAllByText('Player 2')[0]);
    });

    expect(mockedMediaApi.listMedia).toHaveBeenLastCalledWith('user-2');
  });

  it('has no upload or OCR entry point — scoreboards upload from Stats modes', async () => {
    render(<MediaFeedScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Great round');

    expect(screen.queryByText('Upload Screenshot / Clip')).toBeNull();
    expect(screen.queryByText('Extract Stats')).toBeNull();
  });

  it('opens the full-screen viewer when a media row is pressed', async () => {
    render(<MediaFeedScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Great round');

    await act(async () => {
      fireEvent.press(screen.getByLabelText('View image'));
    });

    expect(screen.getByLabelText('Close viewer')).toBeTruthy();
  });

  it('opens MemberProfile when an uploader name is pressed (back returns to Media)', async () => {
    render(<MediaFeedScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Great round');

    await act(async () => {
      fireEvent.press(screen.getAllByLabelText('Player 2 profile')[0]);
    });

    expect(navigation.push).toHaveBeenCalledWith('MemberProfile', {
      userId: 'user-2',
      name: 'Player 2',
    });
  });
});
