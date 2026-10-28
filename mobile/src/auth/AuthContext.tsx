import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { Platform } from 'react-native';
import {
  deleteToken,
  getBiometricEnabled,
  getToken,
  setToken,
} from '../storage/tokenStorage';
import { isBiometricAvailable, promptBiometricAuth } from './biometrics';
import * as authApi from '../api/auth';
import {
  AuthResponse,
  AuthUser,
  OrgSummary,
  TwoFactorChallengeResponse,
  EmailVerificationChallengeResponse,
} from '../api/types';
import { registerPushTokenWithBackend } from '../notifications/registerPushToken';

function toAuthUser(me: AuthUser): AuthUser {
  return {
    id: me.id,
    email: me.email,
    name: me.name,
    avatarUrl: me.avatarUrl,
    phone: me.phone,
    profileComplete: me.profileComplete,
    hasPassword: me.hasPassword,
    twoFactorEnabled: me.twoFactorEnabled,
  };
}

interface AuthContextValue {
  isLoading: boolean;
  user: AuthUser | null;
  org: OrgSummary | null;
  // True when a saved session exists but biometric unlock (enabled by the
  // user in Account Settings) hasn't been passed yet this app open.
  needsBiometricUnlock: boolean;
  retryBiometricUnlock: () => Promise<void>;
  dismissBiometricLock: () => void;
  // Resolves to a challenge when a brand-new signup needs its email verified
  // (see completeEmailVerification) — void means the server skipped the gate
  // (shouldn't happen for a fresh signup, but keeps the type honest).
  signup: (
    email: string,
    password: string,
    name: string,
  ) => Promise<EmailVerificationChallengeResponse | void>;
  completeEmailVerification: (
    challengeToken: string,
    code: string,
  ) => Promise<void>;
  resendEmailVerification: (challengeToken: string) => Promise<void>;
  // Resolves to a challenge when the account has 2FA enabled — the caller
  // (LoginScreen) should navigate to the code-entry screen with it instead
  // of treating the login as complete. void means login finished normally.
  login: (
    email: string,
    password: string,
  ) => Promise<TwoFactorChallengeResponse | void>;
  loginWithGoogle: (
    idToken: string,
  ) => Promise<TwoFactorChallengeResponse | void>;
  completeTwoFactorLogin: (
    challengeToken: string,
    payload: { code?: string; backupCode?: string },
  ) => Promise<void>;
  // Applies a fresh accessToken/user/org — used after login/signup, 2FA
  // verification, and also after changing the password (which rotates the
  // session token) so the current session stays logged in.
  applyAuthResponse: (response: AuthResponse) => Promise<void>;
  logout: () => Promise<void>;
  refreshOrg: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setOrg: (org: OrgSummary) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [org, setOrgState] = useState<OrgSummary | null>(null);
  const [needsBiometricUnlock, setNeedsBiometricUnlock] = useState(false);

  // Restores a saved session on app open. Pulled out of the effect so
  // retryBiometricUnlock can re-run the exact same sequence after a failed
  // or cancelled prompt, without duplicating the token/me() logic.
  const bootstrap = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    if (Platform.OS !== 'web' && (await getBiometricEnabled())) {
      const available = await isBiometricAvailable();
      if (available) {
        const unlocked = await promptBiometricAuth('Unlock Team Coach');
        if (!unlocked) {
          // Don't touch the stored token — just block resuming the session
          // until the user either retries or falls back to password login.
          setNeedsBiometricUnlock(true);
          setIsLoading(false);
          return;
        }
      }
      // If the hardware/enrollment went away since enabling (e.g. Face ID
      // turned off in OS settings), fall through and resume normally rather
      // than locking the user out permanently.
    }

    try {
      const me = await authApi.me();
      setUser(toAuthUser(me));
      setOrgState(me.org);
      registerPushTokenWithBackend();
    } catch {
      await deleteToken();
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const retryBiometricUnlock = useCallback(async () => {
    setNeedsBiometricUnlock(false);
    setIsLoading(true);
    await bootstrap();
  }, [bootstrap]);

  const dismissBiometricLock = useCallback(() => {
    setNeedsBiometricUnlock(false);
  }, []);

  const applyAuthResponse = useCallback(async (response: AuthResponse) => {
    await setToken(response.accessToken);
    setUser(response.user);
    setOrgState(response.org);
    registerPushTokenWithBackend();
  }, []);

  const signup = useCallback(
    async (email: string, password: string, name: string) => {
      const result = await authApi.signup(email, password, name);
      if ('requiresEmailVerification' in result) {
        return result;
      }
      await applyAuthResponse(result);
    },
    [applyAuthResponse],
  );

  const completeEmailVerification = useCallback(
    async (challengeToken: string, code: string) => {
      const response = await authApi.verifyEmailSignup(challengeToken, code);
      await applyAuthResponse(response);
    },
    [applyAuthResponse],
  );

  const resendEmailVerification = useCallback(async (challengeToken: string) => {
    await authApi.resendEmailVerification(challengeToken);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await authApi.login(email, password);
      if ('requiresTwoFactor' in result) {
        return result;
      }
      await applyAuthResponse(result);
    },
    [applyAuthResponse],
  );

  const loginWithGoogle = useCallback(
    async (idToken: string) => {
      const result = await authApi.googleLogin(idToken);
      if ('requiresTwoFactor' in result) {
        return result;
      }
      await applyAuthResponse(result);
    },
    [applyAuthResponse],
  );

  const completeTwoFactorLogin = useCallback(
    async (
      challengeToken: string,
      payload: { code?: string; backupCode?: string },
    ) => {
      const response = await authApi.verifyTwoFactor(challengeToken, payload);
      await applyAuthResponse(response);
    },
    [applyAuthResponse],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Best-effort server-side revocation — if we're offline or the call
      // otherwise fails, still clear the local token so the user isn't
      // stuck signed in on this device.
    }
    await deleteToken();
    setUser(null);
    setOrgState(null);
  }, []);

  const refreshOrg = useCallback(async () => {
    const me = await authApi.me();
    setOrgState(me.org);
  }, []);

  // Re-fetches the user object itself — used after completing the forced
  // post-login profile gate, so `user.profileComplete` flips without
  // requiring a full logout/login round trip. Also used after changing
  // Security settings (password, 2FA) to refresh the displayed status.
  const refreshUser = useCallback(async () => {
    const me = await authApi.me();
    setUser(toAuthUser(me));
    setOrgState(me.org);
  }, []);

  const setOrg = useCallback((nextOrg: OrgSummary) => {
    setOrgState(nextOrg);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        user,
        org,
        needsBiometricUnlock,
        retryBiometricUnlock,
        dismissBiometricLock,
        signup,
        completeEmailVerification,
        resendEmailVerification,
        login,
        loginWithGoogle,
        completeTwoFactorLogin,
        applyAuthResponse,
        logout,
        refreshOrg,
        refreshUser,
        setOrg,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
