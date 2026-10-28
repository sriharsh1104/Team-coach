import React from 'react';
import { Platform } from 'react-native';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { AuthProvider, useAuth } from '../AuthContext';
import { TOKEN_STORAGE_KEY, setBiometricEnabled } from '../../storage/tokenStorage';
import * as authApi from '../../api/auth';
import * as biometrics from '../biometrics';

jest.mock('../../api/auth');
jest.mock('../biometrics');
jest.mock('../../notifications/registerPushToken', () => ({
  registerPushTokenWithBackend: jest.fn(),
}));

const { registerPushTokenWithBackend } = jest.requireMock(
  '../../notifications/registerPushToken',
);

const mockedAuthApi = authApi as jest.Mocked<typeof authApi>;
const mockedBiometrics = biometrics as jest.Mocked<typeof biometrics>;
const originalPlatformOS = Platform.OS;

// jest-expo's test environment has no DOM, so `localStorage` (the web branch
// of tokenStorage.ts, exercised here by the "never prompts on web" case)
// doesn't exist here — a minimal in-memory stand-in is enough.
const localStorageMemory = new Map<string, string>();
(global as any).localStorage = {
  getItem: (key: string) => localStorageMemory.get(key) ?? null,
  setItem: (key: string, value: string) => localStorageMemory.set(key, value),
  removeItem: (key: string) => localStorageMemory.delete(key),
  clear: () => localStorageMemory.clear(),
};

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
  localStorage.clear();
  (Platform as any).OS = originalPlatformOS;
  // Matches the default state (biometric login never enabled) so every
  // existing test above is unaffected by the mock's mere presence.
  mockedBiometrics.isBiometricAvailable.mockResolvedValue(false);
  mockedBiometrics.promptBiometricAuth.mockResolvedValue(false);
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

  it('signup returns the challenge (without logging in) when the server requires email verification', async () => {
    mockedAuthApi.signup.mockResolvedValue({
      requiresEmailVerification: true,
      challengeToken: 'challenge-token',
    });

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let signupResult: any;
    await act(async () => {
      signupResult = await result.current.signup(
        'player1@example.com',
        'Password123!',
        'Player 1',
      );
    });

    expect(signupResult).toEqual({
      requiresEmailVerification: true,
      challengeToken: 'challenge-token',
    });
    expect(result.current.user).toBeNull();
  });

  it('completeEmailVerification verifies the code then logs in', async () => {
    mockedAuthApi.verifyEmailSignup.mockResolvedValue({
      accessToken: 'verified-token',
      user: fakeUser,
      org: null,
    });

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.completeEmailVerification('challenge-token', '123456');
    });

    expect(mockedAuthApi.verifyEmailSignup).toHaveBeenCalledWith('challenge-token', '123456');
    expect(result.current.user).toEqual(fakeUser);
    expect(await SecureStore.getItemAsync(TOKEN_STORAGE_KEY)).toBe('verified-token');
  });

  it('resendEmailVerification passes the challenge token through without changing auth state', async () => {
    mockedAuthApi.resendEmailVerification.mockResolvedValue({ success: true });

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.resendEmailVerification('challenge-token');
    });

    expect(mockedAuthApi.resendEmailVerification).toHaveBeenCalledWith('challenge-token');
    expect(result.current.user).toBeNull();
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

  describe('biometric unlock gate', () => {
    beforeEach(async () => {
      (Platform as any).OS = 'ios';
      await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, 'existing-token');
      await setBiometricEnabled(true);
      mockedAuthApi.me.mockResolvedValue({
        ...fakeUser,
        org: { id: 'org-1', name: 'Alpha Squad', role: 'PLAYER', isOwner: false },
      });
    });

    it('prompts for biometric unlock on bootstrap when enabled and available, and resumes the session on success', async () => {
      mockedBiometrics.isBiometricAvailable.mockResolvedValue(true);
      mockedBiometrics.promptBiometricAuth.mockResolvedValue(true);

      const { result } = renderAuth();
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockedBiometrics.promptBiometricAuth).toHaveBeenCalledWith('Unlock Team Coach');
      expect(result.current.needsBiometricUnlock).toBe(false);
      expect(result.current.user).toEqual(fakeUser);
    });

    it('locks the session instead of resuming it when the prompt fails or is cancelled, without clearing the stored token', async () => {
      mockedBiometrics.isBiometricAvailable.mockResolvedValue(true);
      mockedBiometrics.promptBiometricAuth.mockResolvedValue(false);

      const { result } = renderAuth();
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.needsBiometricUnlock).toBe(true);
      expect(result.current.user).toBeNull();
      expect(mockedAuthApi.me).not.toHaveBeenCalled();
      expect(await SecureStore.getItemAsync(TOKEN_STORAGE_KEY)).toBe('existing-token');
    });

    it('resumes normally without prompting when biometric hardware is unavailable, even if the preference is enabled', async () => {
      mockedBiometrics.isBiometricAvailable.mockResolvedValue(false);

      const { result } = renderAuth();
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockedBiometrics.promptBiometricAuth).not.toHaveBeenCalled();
      expect(result.current.needsBiometricUnlock).toBe(false);
      expect(result.current.user).toEqual(fakeUser);
    });

    it('never prompts on web, regardless of the enabled preference', async () => {
      (Platform as any).OS = 'web';
      localStorage.setItem(TOKEN_STORAGE_KEY, 'existing-token');
      mockedBiometrics.isBiometricAvailable.mockResolvedValue(true);

      const { result } = renderAuth();
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockedBiometrics.promptBiometricAuth).not.toHaveBeenCalled();
      expect(result.current.user).toEqual(fakeUser);
    });

    it('retryBiometricUnlock re-prompts and can resume the session on a later success', async () => {
      mockedBiometrics.isBiometricAvailable.mockResolvedValue(true);
      mockedBiometrics.promptBiometricAuth.mockResolvedValue(false);

      const { result } = renderAuth();
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.needsBiometricUnlock).toBe(true);

      mockedBiometrics.promptBiometricAuth.mockResolvedValue(true);
      await act(async () => {
        await result.current.retryBiometricUnlock();
      });

      expect(result.current.needsBiometricUnlock).toBe(false);
      expect(result.current.user).toEqual(fakeUser);
    });

    it('dismissBiometricLock clears the lock and still allows a normal password login afterwards', async () => {
      mockedBiometrics.isBiometricAvailable.mockResolvedValue(true);
      mockedBiometrics.promptBiometricAuth.mockResolvedValue(false);

      const { result } = renderAuth();
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.needsBiometricUnlock).toBe(true);

      act(() => {
        result.current.dismissBiometricLock();
      });
      expect(result.current.needsBiometricUnlock).toBe(false);
      expect(result.current.user).toBeNull();

      mockedAuthApi.login.mockResolvedValue({
        accessToken: 'login-token',
        user: fakeUser,
        org: null,
      });
      await act(async () => {
        await result.current.login('player1@example.com', 'password123');
      });

      expect(result.current.user).toEqual(fakeUser);
      expect(await SecureStore.getItemAsync(TOKEN_STORAGE_KEY)).toBe('login-token');
    });
  });
});
