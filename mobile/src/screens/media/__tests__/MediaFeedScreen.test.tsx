import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';
import { MediaFeedScreen } from '../MediaFeedScreen';
import * as mediaApi from '../../../api/media';
import * as orgApi from '../../../api/org';
import * as statsApi from '../../../api/stats';

jest.mock('../../../api/media');
jest.mock('../../../api/org');
jest.mock('../../../api/stats');

const mockedMediaApi = mediaApi as jest.Mocked<typeof mediaApi>;
const mockedOrgApi = orgApi as jest.Mocked<typeof orgApi>;
const mockedStatsApi = statsApi as jest.Mocked<typeof statsApi>;

const navigation = { navigate: jest.fn() } as any;

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
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
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

    // "Player 2" also appears as the uploader name on post rows; the chip
    // (rendered in the horizontal filter list) comes first in the tree.
    await act(async () => {
      fireEvent.press(screen.getAllByText('Player 2')[0]);
    });

    expect(mockedMediaApi.listMedia).toHaveBeenLastCalledWith('user-2');
  });

  it('navigates to UploadMedia when the upload button is pressed', async () => {
    render(<MediaFeedScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Great round');

    fireEvent.press(screen.getByText('Upload Screenshot / Clip'));
    expect(navigation.navigate).toHaveBeenCalledWith('UploadMedia');
  });

  it('requests extraction and navigates to ExtractionReview on success', async () => {
    const extraction = { id: 'ext-1' } as any;
    mockedStatsApi.requestExtraction.mockResolvedValue(extraction);
    render(<MediaFeedScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Great round');

    await act(async () => {
      fireEvent.press(screen.getByText('Extract Stats'));
    });

    expect(mockedStatsApi.requestExtraction).toHaveBeenCalledWith('post-1');
    expect(navigation.navigate).toHaveBeenCalledWith('ExtractionReview', { extraction });
  });

  it('does not show an Extract Stats link for video posts', async () => {
    mockedMediaApi.listMedia.mockResolvedValue([videoPost]);
    render(<MediaFeedScreen navigation={navigation} route={{} as any} />);
    await waitFor(() => expect(mockedMediaApi.listMedia).toHaveBeenCalled());

    expect(screen.queryByText('Extract Stats')).toBeNull();
  });

  it('shows "Already extracted" alert on a 409 conflict', async () => {
    mockedStatsApi.requestExtraction.mockRejectedValue({ response: { status: 409 } });
    render(<MediaFeedScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Great round');

    await act(async () => {
      fireEvent.press(screen.getByText('Extract Stats'));
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Already extracted',
      'This screenshot already has a stat extraction — check Stats > Pending Review.',
    );
    expect(navigation.navigate).not.toHaveBeenCalledWith('ExtractionReview', expect.anything());
  });

  it('shows a generic error alert for other extraction failures', async () => {
    mockedStatsApi.requestExtraction.mockRejectedValue({
      response: { data: { message: 'Screenshot unreadable' } },
    });
    render(<MediaFeedScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('Great round');

    await act(async () => {
      fireEvent.press(screen.getByText('Extract Stats'));
    });

    expect(Alert.alert).toHaveBeenCalledWith('Could not extract stats', 'Screenshot unreadable');
  });
});
