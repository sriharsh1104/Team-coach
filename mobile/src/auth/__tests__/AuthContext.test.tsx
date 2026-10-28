import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { AuthProvider, useAuth } from '../AuthContext';
import { TOKEN_STORAGE_KEY } from '../../api/client';
import * as authApi from '../../api/auth';

jest.mock('../../api/auth');
jest.mock('../../notifications/registerPushToken', () => ({
  registerPushTokenWithBackend: jest.fn(),
}));

const { registerPushTokenWithBackend } = jest.requireMock(
  '../../notifications/registerPushToken',
);

const mockedAuthApi = authApi as jest.Mocked<typeof authApi>;

function renderAuth() {
  return renderHook(() => useAuth(), {
    wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
  });
}

const fakeUser = {
  id: 'user-1',
  email: 'player1@example.com',
  name: 'Player 1',
  avatarUrl: null,
  phone: null,
  profileComplete: true,
  hasPassword: true,
  twoFactorEnabled: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStore as any).clear();
});

describe('AuthContext', () => {
  it('starts loading, then settles with no user when storage has no token', async () => {
    const { result } = renderAuth();
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.org).toBeNull();
    expect(mockedAuthApi.me).not.toHaveBeenCalled();
  });

  it('restores the session from a stored token on mount', async () => {
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'existing-token');
    mockedAuthApi.me.mockResolvedValue({
      ...fakeUser,
      org: { id: 'org-1', name: 'Alpha Squad', role: 'PLAYER', isOwner: false },
    });

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toEqual(fakeUser);
    expect(result.current.org).toEqual({ id: 'org-1', name: 'Alpha Squad', role: 'PLAYER', isOwner: false });
    expect(registerPushTokenWithBackend).toHaveBeenCalledTimes(1);
  });

  it('clears a stored token that no longer verifies (expired/invalid) instead of getting stuck', async () => {
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'stale-token');
    mockedAuthApi.me.mockRejectedValue(new Error('401'));

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(await SecureStore.getItemAsync(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('signup persists the token and populates user/org from the response', async () => {
    mockedAuthApi.signup.mockResolvedValue({
      accessToken: 'new-token',
      user: fakeUser,
      org: null,
    });

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.signup('player1@example.com', 'password123', 'Player 1');
    });

    expect(result.current.user).toEqual(fakeUser);
    expect(await SecureStore.getItemAsync(TOKEN_STORAGE_KEY)).toBe('new-token');
    expect(registerPushTokenWithBackend).toHaveBeenCalledTimes(1);
  });

  it('login persists the token and populates user/org', async () => {
    mockedAuthApi.login.mockResolvedValue({
      accessToken: 'login-token',
      user: fakeUser,
      org: { id: 'org-1', name: 'Alpha Squad', role: 'COACH', isOwner: false },
    });

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('player1@example.com', 'password123');
    });

    expect(result.current.user).toEqual(fakeUser);
    expect(result.current.org?.role).toBe('COACH');
  });

  it('login returns the challenge (without logging in) when the account has 2FA enabled', async () => {
    mockedAuthApi.login.mockResolvedValue({
      requiresTwoFactor: true,
      challengeToken: 'challenge-token',
    });

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let loginResult: any;
    await act(async () => {
      loginResult = await result.current.login('player1@example.com', 'password123');
    });

    expect(loginResult).toEqual({ requiresTwoFactor: true, challengeToken: 'challenge-token' });
    expect(result.current.user).toBeNull();
  });

  it('completeTwoFactorLogin verifies the code then logs in', async () => {
    mockedAuthApi.verifyTwoFactor.mockResolvedValue({
      accessToken: 'verified-token',
      user: fakeUser,
      org: null,
    });

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.completeTwoFactorLogin('challenge-token', { code: '123456' });
    });

    expect(mockedAuthApi.verifyTwoFactor).toHaveBeenCalledWith('challenge-token', {
      code: '123456',
    });
    expect(result.current.user).toEqual(fakeUser);
    expect(await SecureStore.getItemAsync(TOKEN_STORAGE_KEY)).toBe('verified-token');
  });

  it('loginWithGoogle goes through the same apply-response path as email login', async () => {
    mockedAuthApi.googleLogin.mockResolvedValue({
      accessToken: 'google-token',
      user: fakeUser,
      org: null,
    });

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.loginWithGoogle('fake-id-token');
    });

    expect(mockedAuthApi.googleLogin).toHaveBeenCalledWith('fake-id-token');
    expect(result.current.user).toEqual(fakeUser);
    expect(await SecureStore.getItemAsync(TOKEN_STORAGE_KEY)).toBe('google-token');
  });

  it('logout clears both the token and in-memory user/org state', async () => {
    mockedAuthApi.login.mockResolvedValue({
      accessToken: 'login-token',
      user: fakeUser,
      org: { id: 'org-1', name: 'Alpha Squad', role: 'PLAYER', isOwner: false },
    });

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.login('player1@example.com', 'password123');
    });
    expect(result.current.user).not.toBeNull();

    mockedAuthApi.logout.mockResolvedValue(undefined);
    await act(async () => {
      await result.current.logout();
    });

    expect(mockedAuthApi.logout).toHaveBeenCalledTimes(1);
    expect(result.current.user).toBeNull();
    expect(result.current.org).toBeNull();
    expect(await SecureStore.getItemAsync(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('logout still clears local session state even if the server call fails (e.g. offline)', async () => {
    mockedAuthApi.login.mockResolvedValue({
      accessToken: 'login-token',
      user: fakeUser,
      org: null,
    });
    mockedAuthApi.logout.mockRejectedValue(new Error('Network error'));

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.login('player1@example.com', 'password123');
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(await SecureStore.getItemAsync(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('refreshOrg updates only the org, leaving the user untouched', async () => {
    mockedAuthApi.login.mockResolvedValue({
      accessToken: 'login-token',
      user: fakeUser,
      org: null,
    });

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.login('player1@example.com', 'password123');
    });
    expect(result.current.org).toBeNull();

    mockedAuthApi.me.mockResolvedValue({
      ...fakeUser,
      org: { id: 'org-2', name: 'Newly Joined Org', role: 'PLAYER', isOwner: false },
    });
    await act(async () => {
      await result.current.refreshOrg();
    });

    expect(result.current.org).toEqual({ id: 'org-2', name: 'Newly Joined Org', role: 'PLAYER', isOwner: false });
    expect(result.current.user).toEqual(fakeUser);
  });

  it('refreshUser re-fetches the user object (e.g. after completing the profile gate)', async () => {
    mockedAuthApi.login.mockResolvedValue({
      accessToken: 'login-token',
      user: { ...fakeUser, profileComplete: false },
      org: null,
    });

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.login('player1@example.com', 'password123');
    });
    expect(result.current.user?.profileComplete).toBe(false);

    mockedAuthApi.me.mockResolvedValue({ ...fakeUser, profileComplete: true, org: null });
    await act(async () => {
      await result.current.refreshUser();
    });

    expect(result.current.user?.profileComplete).toBe(true);
  });

  it('setOrg updates state directly without calling the API (used right after create/join)', async () => {
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.setOrg({ id: 'org-3', name: 'Fresh Org', role: 'COACH', isOwner: true });
    });

    expect(result.current.org).toEqual({ id: 'org-3', name: 'Fresh Org', role: 'COACH', isOwner: true });
    expect(mockedAuthApi.me).not.toHaveBeenCalled();
  });
});
