import React from 'react';
import NetInfo from '@react-native-community/netinfo';
import { act, render, screen } from '@testing-library/react-native';
import {
  resetNetworkStatus,
  startNetworkWatch,
} from '../../net/networkStatus';
import { OfflineBanner } from '../OfflineBanner';

const addEventListener = NetInfo.addEventListener as jest.Mock;

type Handler = (state: {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
}) => void;

function captureHandler(): Handler {
  startNetworkWatch();
  return addEventListener.mock.calls.at(-1)![0] as Handler;
}

describe('OfflineBanner', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetNetworkStatus();
    addEventListener.mockClear();
    addEventListener.mockReturnValue(jest.fn());
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('renders nothing while the connection is healthy', () => {
    render(<OfflineBanner />);
    expect(screen.queryByText(/offline/i)).toBeNull();
  });

  it('explains the outage when the device drops offline', () => {
    const emit = captureHandler();
    render(<OfflineBanner />);

    act(() => emit({ isConnected: false }));

    expect(screen.getByText(/You're offline/)).toBeTruthy();
  });

  it('confirms recovery, then clears itself', () => {
    const emit = captureHandler();
    render(<OfflineBanner />);
    act(() => emit({ isConnected: false }));

    act(() => emit({ isConnected: true, isInternetReachable: true }));
    expect(screen.getByText('Back online')).toBeTruthy();

    act(() => jest.advanceTimersByTime(2000));
    expect(screen.queryByText('Back online')).toBeNull();
  });

  it('stays silent on a reconnect it never saw drop', () => {
    const emit = captureHandler();
    render(<OfflineBanner />);

    act(() => emit({ isConnected: true, isInternetReachable: true }));

    expect(screen.queryByText('Back online')).toBeNull();
  });
});
