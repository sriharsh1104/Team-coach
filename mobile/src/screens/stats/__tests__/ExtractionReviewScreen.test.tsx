import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';
import { ExtractionReviewScreen } from '../ExtractionReviewScreen';
import * as statsApi from '../../../api/stats';
import * as orgApi from '../../../api/org';

jest.mock('../../../api/stats');
jest.mock('../../../api/org');

const mockedStatsApi = statsApi as jest.Mocked<typeof statsApi>;
const mockedOrgApi = orgApi as jest.Mocked<typeof orgApi>;
const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any;

const extraction = {
  id: 'ext-1',
  status: 'PENDING',
  rows: [
    { rawName: 'SES-SRI', matchedUserId: null, kills: 3, deaths: 0, assists: 2, damage: 0 },
    { rawName: 'ANNIE~GAMING', matchedUserId: null, kills: 5, deaths: 0, assists: 0, damage: 0 },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  reviewedAt: null,
  mediaPostId: 'post-1',
  mediaUrl: '/media-files/post-1.jpg',
} as any;

const route = { params: { extraction } } as any;

async function pressAndSettle(text: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(text));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockedOrgApi.getMyOrg.mockResolvedValue({
    id: 'org-1',
    name: 'Alpha Squad',
    orgCode: '75HCP3',
    members: [
      {
        userId: 'user-1',
        name: 'prashant',
        avatarUrl: null,
        role: 'PLAYER',
        inGameName: 'SES-SRI',
      },
    ],
  } as any);
});

describe('ExtractionReviewScreen', () => {
  it('auto-matches IGN to teammate and marks outsiders as skipped', async () => {
    render(<ExtractionReviewScreen navigation={navigation} route={route} />);

    await screen.findByText('Confirm & Save 1 Teammate(s)');
    expect(screen.getByDisplayValue('SES-SRI')).toBeTruthy();
    expect(screen.getByText(/Teammate · Will Save/i)).toBeTruthy();
    expect(screen.getByText(/Not On Team · Won't Save/i)).toBeTruthy();
    expect(screen.getByDisplayValue('ANNIE~GAMING')).toBeTruthy();
  });

  it('saves only matched teammate rows and ignores outsiders', async () => {
    mockedStatsApi.confirmExtraction.mockResolvedValue({
      confirmedRows: 1,
      skippedRows: 1,
    });
    render(<ExtractionReviewScreen navigation={navigation} route={route} />);
    await screen.findByText('Confirm & Save 1 Teammate(s)');

    await pressAndSettle('Confirm & Save 1 Teammate(s)');

    expect(mockedStatsApi.updateExtractionRows).toHaveBeenCalledWith('ext-1', [
      expect.objectContaining({
        rawName: 'SES-SRI',
        matchedUserId: 'user-1',
        kills: 3,
        assists: 2,
      }),
    ]);
    expect(mockedStatsApi.confirmExtraction).toHaveBeenCalledWith('ext-1');
    expect(Alert.alert).toHaveBeenCalledWith(
      'Teammate Stats Saved',
      expect.stringContaining('1 teammate(s) updated'),
    );
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('blocks confirm when nobody is matched to a teammate', async () => {
    mockedOrgApi.getMyOrg.mockResolvedValue({
      id: 'org-1',
      members: [
        { userId: 'user-9', name: 'other', avatarUrl: null, role: 'PLAYER', inGameName: null },
      ],
    } as any);
    render(<ExtractionReviewScreen navigation={navigation} route={route} />);
    await screen.findByText('Confirm & Save 0 Teammate(s)');

    await pressAndSettle('Confirm & Save 0 Teammate(s)');
    expect(mockedStatsApi.confirmExtraction).not.toHaveBeenCalled();
  });

  it('treats a non-numeric kill edit as 0 after a teammate is matched', async () => {
    render(<ExtractionReviewScreen navigation={navigation} route={route} />);
    await screen.findByText('Confirm & Save 1 Teammate(s)');

    fireEvent.changeText(screen.getByDisplayValue('3'), 'abc');
    await pressAndSettle('Confirm & Save 1 Teammate(s)');

    expect(mockedStatsApi.updateExtractionRows).toHaveBeenCalledWith('ext-1', [
      expect.objectContaining({ kills: 0, matchedUserId: 'user-1' }),
    ]);
  });

  it('shows an error alert and does not navigate back when saving fails', async () => {
    mockedStatsApi.updateExtractionRows.mockRejectedValue({
      response: { data: { message: 'Extraction already reviewed' } },
    });
    render(<ExtractionReviewScreen navigation={navigation} route={route} />);
    await screen.findByText('Confirm & Save 1 Teammate(s)');

    await pressAndSettle('Confirm & Save 1 Teammate(s)');

    expect(Alert.alert).toHaveBeenCalledWith('Could not save', 'Extraction already reviewed');
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('rejects the extraction after confirming discard, then navigates back', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const discard = buttons?.find((b) => b.text === 'Discard');
      discard?.onPress?.(undefined as any);
    });
    mockedStatsApi.rejectExtraction.mockResolvedValue(undefined as any);
    render(<ExtractionReviewScreen navigation={navigation} route={route} />);
    await waitFor(() => expect(screen.getByText('Discard This Extraction')).toBeTruthy());

    await pressAndSettle('Discard This Extraction');

    expect(mockedStatsApi.rejectExtraction).toHaveBeenCalledWith('ext-1');
    expect(navigation.goBack).toHaveBeenCalled();
    expect(mockedStatsApi.updateExtractionRows).not.toHaveBeenCalled();
  });

  it('includes an editable Damage field, submitted alongside kills/assists', async () => {
    render(<ExtractionReviewScreen navigation={navigation} route={route} />);
    await screen.findByText('Confirm & Save 1 Teammate(s)');

    // The matched teammate's card (SES-SRI) renders first, under "Will Save".
    const damageInputs = screen.getAllByDisplayValue('0');
    fireEvent.changeText(damageInputs[0], '750');
    await pressAndSettle('Confirm & Save 1 Teammate(s)');

    expect(mockedStatsApi.updateExtractionRows).toHaveBeenCalledWith('ext-1', [
      expect.objectContaining({ rawName: 'SES-SRI', damage: 750 }),
    ]);
  });

  describe('still-processing / failed states', () => {
    const queuedExtraction = {
      ...extraction,
      status: 'QUEUED',
      rows: [],
      failureReason: null,
    };
    const queuedRoute = { params: { extraction: queuedExtraction } } as any;

    it('shows a processing state and polls until the extraction is ready, instead of the row editor', async () => {
      jest.useFakeTimers();
      mockedStatsApi.getExtraction.mockResolvedValue({
        ...queuedExtraction,
        status: 'PENDING',
        rows: extraction.rows,
      });
      render(<ExtractionReviewScreen navigation={navigation} route={queuedRoute} />);

      expect(screen.getByText(/Still processing/)).toBeTruthy();
      expect(screen.queryByText(/Confirm & Save/)).toBeNull();

      await act(async () => {
        jest.advanceTimersByTime(3000);
      });

      await waitFor(() => expect(screen.getByText('Confirm & Save 1 Teammate(s)')).toBeTruthy());
      jest.useRealTimers();
    });

    it('shows a retry/discard state for a FAILED extraction', async () => {
      const failedRoute = {
        params: {
          extraction: { ...queuedExtraction, status: 'FAILED', failureReason: 'Gemini timed out' },
        },
      } as any;
      mockedStatsApi.retryExtraction.mockResolvedValue({ ...queuedExtraction, status: 'QUEUED' });
      render(<ExtractionReviewScreen navigation={navigation} route={failedRoute} />);

      await screen.findByText('Gemini timed out');
      await pressAndSettle('Retry');
      expect(mockedStatsApi.retryExtraction).toHaveBeenCalledWith('ext-1');
    });

    it('discards a FAILED extraction and navigates back without a confirm dialog', async () => {
      const failedRoute = {
        params: {
          extraction: { ...queuedExtraction, status: 'FAILED', failureReason: 'boom' },
        },
      } as any;
      mockedStatsApi.rejectExtraction.mockResolvedValue(undefined as any);
      render(<ExtractionReviewScreen navigation={navigation} route={failedRoute} />);

      await screen.findByText('Discard');
      await pressAndSettle('Discard');

      expect(mockedStatsApi.rejectExtraction).toHaveBeenCalledWith('ext-1');
      expect(navigation.goBack).toHaveBeenCalled();
    });
  });
});
