import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
};

beforeEach(() => {
  jest.clearAllMocks();
  AsyncStorage.clear();
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
    await AsyncStorage.setItem(TOKEN_STORAGE_KEY, 'existing-token');
    mockedAuthApi.me.mockResolvedValue({
      ...fakeUser,
      org: { id: 'org-1', name: 'Alpha Squad', role: 'PLAYER' },
    });

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toEqual(fakeUser);
    expect(result.current.org).toEqual({ id: 'org-1', name: 'Alpha Squad', role: 'PLAYER' });
    expect(registerPushTokenWithBackend).toHaveBeenCalledTimes(1);
  });

  it('clears a stored token that no longer verifies (expired/invalid) instead of getting stuck', async () => {
    await AsyncStorage.setItem(TOKEN_STORAGE_KEY, 'stale-token');
    mockedAuthApi.me.mockRejectedValue(new Error('401'));

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(await AsyncStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
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
    expect(await AsyncStorage.getItem(TOKEN_STORAGE_KEY)).toBe('new-token');
    expect(registerPushTokenWithBackend).toHaveBeenCalledTimes(1);
  });

  it('login persists the token and populates user/org', async () => {
    mockedAuthApi.login.mockResolvedValue({
      accessToken: 'login-token',
      user: fakeUser,
      org: { id: 'org-1', name: 'Alpha Squad', role: 'COACH' },
    });

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('player1@example.com', 'password123');
    });

    expect(result.current.user).toEqual(fakeUser);
    expect(result.current.org?.role).toBe('COACH');
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
    expect(await AsyncStorage.getItem(TOKEN_STORAGE_KEY)).toBe('google-token');
  });

  it('logout clears both the token and in-memory user/org state', async () => {
    mockedAuthApi.login.mockResolvedValue({
      accessToken: 'login-token',
      user: fakeUser,
      org: { id: 'org-1', name: 'Alpha Squad', role: 'PLAYER' },
    });

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.login('player1@example.com', 'password123');
    });
    expect(result.current.user).not.toBeNull();

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.org).toBeNull();
    expect(await AsyncStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
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
      org: { id: 'org-2', name: 'Newly Joined Org', role: 'PLAYER' },
    });
    await act(async () => {
      await result.current.refreshOrg();
    });

    expect(result.current.org).toEqual({ id: 'org-2', name: 'Newly Joined Org', role: 'PLAYER' });
    expect(result.current.user).toEqual(fakeUser);
  });

  it('setOrg updates state directly without calling the API (used right after create/join)', async () => {
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.setOrg({ id: 'org-3', name: 'Fresh Org', role: 'COACH' });
    });

    expect(result.current.org).toEqual({ id: 'org-3', name: 'Fresh Org', role: 'COACH' });
    expect(mockedAuthApi.me).not.toHaveBeenCalled();
  });
});
