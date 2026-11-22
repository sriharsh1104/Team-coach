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
    expect(mockedVoiceApi.getVoiceOccupancy).toHaveBeenCalledWith('team');
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
});
