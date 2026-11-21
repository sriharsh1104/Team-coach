import NetInfo from '@react-native-community/netinfo';
import {
  resetWarmup,
  subscribeWarmup,
  warmUpServer,
  warmupState,
} from '../serverWarmup';
import { resetNetworkStatus, startNetworkWatch } from '../../net/networkStatus';

const fetchMock = jest.fn();

describe('serverWarmup', () => {
  beforeEach(() => {
    resetWarmup();
    resetNetworkStatus();
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    (NetInfo.addEventListener as jest.Mock).mockReturnValue(jest.fn());
  });

  it('starts idle and reports warm once /health answers', async () => {
    expect(warmupState()).toBe('idle');
    fetchMock.mockResolvedValue({ ok: true });

    warmUpServer();
    await new Promise((r) => setImmediate(r));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/health');
    expect(warmupState()).toBe('warm');
  });

  it('announces the warming state so the UI can explain the wait', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const seen: string[] = [];
    subscribeWarmup((s) => seen.push(s));

    warmUpServer();
    await new Promise((r) => setImmediate(r));

    expect(seen).toEqual(['warming', 'warm']);
  });

  it('does not start a second run while one is in flight', async () => {
    fetchMock.mockResolvedValue({ ok: true });

    warmUpServer();
    warmUpServer();
    await new Promise((r) => setImmediate(r));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('is a no-op once the server is known warm', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    warmUpServer();
    await new Promise((r) => setImmediate(r));

    warmUpServer();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up without retrying while the device is offline', async () => {
    startNetworkWatch();
    const emit = (NetInfo.addEventListener as jest.Mock).mock.calls.at(-1)![0];
    emit({ isConnected: false });

    warmUpServer();
    await new Promise((r) => setImmediate(r));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warmupState()).toBe('failed');
  });
});
