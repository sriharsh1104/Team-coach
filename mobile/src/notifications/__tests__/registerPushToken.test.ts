jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'fake-token' }),
  setNotificationHandler: jest.fn(),
  setNotificationCategoryAsync: jest.fn().mockResolvedValue(undefined),
  addNotificationResponseReceivedListener: jest.fn(),
  AndroidImportance: { MAX: 5 },
}));

jest.mock('../../storage/tokenStorage', () => ({
  getToken: jest.fn(),
}));

jest.mock('../../api/users', () => ({
  setPushToken: jest.fn().mockResolvedValue(undefined),
}));

import { getToken } from '../../storage/tokenStorage';
import * as usersApi from '../../api/users';
import { registerPushTokenWithBackend } from '../registerPushToken';

describe('registerPushTokenWithBackend', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips registering the push token when there is no signed-in session', async () => {
    // This is the exact path an AppState foreground fires through after
    // logout — the listener in registerPushToken.ts outlives sign-out, so
    // without this guard it kept PATCHing the push token with no session
    // and surfaced an "Unauthorized" toast.
    (getToken as jest.Mock).mockResolvedValue(null);
    await registerPushTokenWithBackend();
    expect(usersApi.setPushToken).not.toHaveBeenCalled();
  });

  it('registers the push token normally when a session exists', async () => {
    (getToken as jest.Mock).mockResolvedValue('real-token');
    await registerPushTokenWithBackend();
    expect(usersApi.setPushToken).toHaveBeenCalledWith('fake-token');
  });
});
