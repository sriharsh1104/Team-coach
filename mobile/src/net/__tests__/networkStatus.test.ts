import NetInfo from '@react-native-community/netinfo';
import {
  isOnline,
  resetNetworkStatus,
  startNetworkWatch,
  subscribeNetworkStatus,
} from '../networkStatus';

type Handler = (state: {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
}) => void;

const addEventListener = NetInfo.addEventListener as jest.Mock;
const fetchState = NetInfo.fetch as jest.Mock;

/** Starts the watch and hands back the listener NetInfo was given. */
function startAndCapture(): Handler {
  startNetworkWatch();
  return addEventListener.mock.calls.at(-1)![0] as Handler;
}

describe('networkStatus', () => {
  beforeEach(() => {
    resetNetworkStatus();
    addEventListener.mockClear();
    addEventListener.mockReturnValue(jest.fn());
    fetchState.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    });
  });

  it('starts optimistic so a cold start is never blocked before NetInfo reports', () => {
    expect(isOnline()).toBe(true);
  });

  it('goes offline when the device reports no connection', () => {
    const emit = startAndCapture();
    emit({ isConnected: false, isInternetReachable: false });
    expect(isOnline()).toBe(false);
  });

  it('treats connected-but-unreachable as offline', () => {
    // Captive portals / a router with no route out: connected, no internet.
    const emit = startAndCapture();
    emit({ isConnected: true, isInternetReachable: false });
    expect(isOnline()).toBe(false);
  });

  it('stays online while reachability is still unknown', () => {
    const emit = startAndCapture();
    emit({ isConnected: true, isInternetReachable: null });
    expect(isOnline()).toBe(true);
  });

  it('notifies subscribers only when the state actually flips', () => {
    const emit = startAndCapture();
    const seen: boolean[] = [];
    subscribeNetworkStatus((online) => seen.push(online));

    emit({ isConnected: false });
    emit({ isConnected: false });
    emit({ isConnected: true, isInternetReachable: true });

    expect(seen).toEqual([false, true]);
  });

  it('stops notifying after a subscriber unsubscribes', () => {
    const emit = startAndCapture();
    const listener = jest.fn();
    subscribeNetworkStatus(listener)();

    emit({ isConnected: false });

    expect(listener).not.toHaveBeenCalled();
  });

  it('only subscribes to NetInfo once however often the watch is started', () => {
    startNetworkWatch();
    startNetworkWatch();
    expect(addEventListener).toHaveBeenCalledTimes(1);
  });
});
