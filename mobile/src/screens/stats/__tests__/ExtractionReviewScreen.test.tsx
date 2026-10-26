import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
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
    { rawName: 'PlayerOne', matchedUserId: null, kills: 5, deaths: 2, assists: 1 },
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
    members: [{ userId: 'user-2', name: 'Teammate', avatarUrl: null, role: 'PLAYER' }],
  } as any);
});

describe('ExtractionReviewScreen', () => {
  it('renders each row prefilled with the raw name and stats', async () => {
    render(<ExtractionReviewScreen navigation={navigation} route={route} />);

    expect(screen.getByDisplayValue('PlayerOne')).toBeTruthy();
    expect(screen.getByDisplayValue('5')).toBeTruthy();
    expect(screen.getByDisplayValue('2')).toBeTruthy();
    expect(screen.getByDisplayValue('1')).toBeTruthy();
    await screen.findByText('Teammate');
  });

  it('defaults to "No match" and switches to a teammate chip when pressed', async () => {
    render(<ExtractionReviewScreen navigation={navigation} route={route} />);
    await screen.findByText('Teammate');

    fireEvent.press(screen.getByText('Teammate'));
    await pressAndSettle('Confirm & Save Stats');

    expect(mockedStatsApi.updateExtractionRows).toHaveBeenCalledWith('ext-1', [
      expect.objectContaining({ matchedUserId: 'user-2' }),
    ]);
  });

  it('treats a non-numeric stat edit as 0, not NaN or a crash', async () => {
    render(<ExtractionReviewScreen navigation={navigation} route={route} />);

    fireEvent.changeText(screen.getByDisplayValue('5'), 'abc');
    await pressAndSettle('Confirm & Save Stats');

    expect(mockedStatsApi.updateExtractionRows).toHaveBeenCalledWith('ext-1', [
      expect.objectContaining({ kills: 0 }),
    ]);
  });

  it('saves rows, confirms, shows the result, and navigates back', async () => {
    mockedStatsApi.confirmExtraction.mockResolvedValue({ confirmedRows: 1, skippedRows: 0 });
    render(<ExtractionReviewScreen navigation={navigation} route={route} />);

    await pressAndSettle('Confirm & Save Stats');

    expect(mockedStatsApi.updateExtractionRows).toHaveBeenCalledWith('ext-1', extraction.rows);
    expect(mockedStatsApi.confirmExtraction).toHaveBeenCalledWith('ext-1');
    expect(Alert.alert).toHaveBeenCalledWith('Stats saved', '1 player(s) updated.');
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('mentions skipped rows in the confirmation message when some rows had no match', async () => {
    mockedStatsApi.confirmExtraction.mockResolvedValue({ confirmedRows: 1, skippedRows: 2 });
    render(<ExtractionReviewScreen navigation={navigation} route={route} />);

    await pressAndSettle('Confirm & Save Stats');

    expect(Alert.alert).toHaveBeenCalledWith(
      'Stats saved',
      '1 player(s) updated, 2 skipped (no player matched).',
    );
  });

  it('shows an error alert and does not navigate back when saving fails', async () => {
    mockedStatsApi.updateExtractionRows.mockRejectedValue({
      response: { data: { message: 'Extraction already reviewed' } },
    });
    render(<ExtractionReviewScreen navigation={navigation} route={route} />);

    await pressAndSettle('Confirm & Save Stats');

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

    await pressAndSettle('Discard this extraction');

    expect(mockedStatsApi.rejectExtraction).toHaveBeenCalledWith('ext-1');
    expect(navigation.goBack).toHaveBeenCalled();
    expect(mockedStatsApi.updateExtractionRows).not.toHaveBeenCalled();
  });
});
