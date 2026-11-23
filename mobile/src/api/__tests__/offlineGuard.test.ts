import NetInfo from '@react-native-community/netinfo';
import { apiClient } from '../client';
import { apiErrorMessage } from '../apiErrorMessage';
import {
  OFFLINE_ERROR_CODE,
  resetNetworkStatus,
  startNetworkWatch,
} from '../../net/networkStatus';
import { emitToast } from '../../ui/toastBus';

jest.mock('../../ui/toastBus', () => ({
  emitToast: jest.fn(),
  setToastListener: jest.fn(),
}));

const addEventListener = NetInfo.addEventListener as jest.Mock;

function goOffline() {
  startNetworkWatch();
  const handler = addEventListener.mock.calls.at(-1)![0];
  handler({ isConnected: false, isInternetReachable: false });
}

describe('offline request guard', () => {
  beforeEach(() => {
    resetNetworkStatus();
    addEventListener.mockClear();
    addEventListener.mockReturnValue(jest.fn());
    (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: false });
    (emitToast as jest.Mock).mockClear();
  });

  it('rejects immediately instead of waiting out the request timeout', async () => {
    goOffline();
    const started = Date.now();

    await expect(apiClient.get('/org/me')).rejects.toMatchObject({
      code: OFFLINE_ERROR_CODE,
    });

    // The axios timeout is 15s; failing fast means well under a second.
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('does not toast — the offline banner already says it', async () => {
    goOffline();
    await expect(apiClient.post('/chat/send', {})).rejects.toBeDefined();
    expect(emitToast).not.toHaveBeenCalled();
  });

  it('maps the offline error to a message a screen can show', () => {
    expect(apiErrorMessage({ code: OFFLINE_ERROR_CODE })).toBe(
      "You're offline. Reconnect and try again.",
    );
  });

  it('leaves other errors alone', () => {
    expect(
      apiErrorMessage({ response: { status: 413 } }),
    ).toContain('too large');
  });

  it('does not toast the expected no-guild 404 (admins / pre-join)', async () => {
    const adapter = jest.fn().mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 404,
        data: { message: 'You are not part of a guild yet' },
      },
      config: { url: '/announcements/unread' },
      toJSON: () => ({}),
    });
    const prev = apiClient.defaults.adapter;
    apiClient.defaults.adapter = adapter as typeof prev;
    try {
      await expect(apiClient.get('/announcements/unread')).rejects.toBeDefined();
      expect(emitToast).not.toHaveBeenCalled();
    } finally {
      apiClient.defaults.adapter = prev;
    }
  });
});
