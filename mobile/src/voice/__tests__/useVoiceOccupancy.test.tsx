import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useVoiceOccupancy } from '../useVoiceOccupancy';
import * as voiceApi from '../../api/voice';

jest.mock('../../api/voice');

const mockedVoiceApi = voiceApi as jest.Mocked<typeof voiceApi>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedVoiceApi.getVoiceOccupancy.mockResolvedValue({
    room: 'team',
    max: 5,
    count: 1,
    participants: [{ id: 'u2', name: 'Bob', avatarUrl: null }],
  });
});

describe('useVoiceOccupancy', () => {
  it('loads occupancy for the requested room', async () => {
    const { result } = renderHook(() => useVoiceOccupancy('team'));
    await waitFor(() => expect(result.current.occupancy.count).toBe(1));
    // peerId is passed through for every room kind — undefined for the
    // shared rooms, the other person's id for a 1-on-1.
    expect(mockedVoiceApi.getVoiceOccupancy).toHaveBeenCalledWith(
      'team',
      undefined,
    );
    expect(result.current.occupancy.participants[0].name).toBe('Bob');
  });

  it('stays empty when disabled', async () => {
    const { result } = renderHook(() =>
      useVoiceOccupancy('guild', { enabled: false }),
    );
    await act(async () => {});
    expect(mockedVoiceApi.getVoiceOccupancy).not.toHaveBeenCalled();
    expect(result.current.occupancy.count).toBe(0);
  });

  it('treats an empty guild lobby (nobody joined LiveKit yet) as count 0', async () => {
    mockedVoiceApi.getVoiceOccupancy.mockResolvedValue({
      room: 'guild',
      max: 50,
      count: 0,
      participants: [],
    });
    const { result } = renderHook(() => useVoiceOccupancy('guild'));
    await waitFor(() =>
      expect(mockedVoiceApi.getVoiceOccupancy).toHaveBeenCalledWith(
        'guild',
        undefined,
      ),
    );
    expect(result.current.occupancy.count).toBe(0);
    expect(result.current.occupancy.participants).toEqual([]);
  });

  it('keeps the last occupancy when a poll fails', async () => {
    const { result } = renderHook(() => useVoiceOccupancy('team'));
    await waitFor(() => expect(result.current.occupancy.count).toBe(1));

    mockedVoiceApi.getVoiceOccupancy.mockRejectedValueOnce(
      new Error('network down'),
    );
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.occupancy.count).toBe(1);
  });
});
