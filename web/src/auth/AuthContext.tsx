import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import * as authApi from '../api/auth';
import { TOKEN_STORAGE_KEY } from '../api/client';
import {
  AuthResponse,
  AuthUser,
  EmailVerificationChallengeResponse,
  OrgSummary,
  TwoFactorChallengeResponse,
} from '../api/types';

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
  login: (
    email: string,
    password: string,
  ) => Promise<TwoFactorChallengeResponse | void>;
  completeTwoFactorLogin: (
    challengeToken: string,
    payload: { code?: string; backupCode?: string },
  ) => Promise<void>;
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

  useEffect(() => {
    (async () => {
      const token = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const me = await authApi.me();
        setUser(toAuthUser(me));
        setOrgState(me.org);
      } catch {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const applyAuthResponse = useCallback(async (response: AuthResponse) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, response.accessToken);
    setUser(response.user);
    setOrgState(response.org);
  }, []);

  const signup = useCallback(
    async (email: string, password: string, name: string) => {
      const result = await authApi.signup(email, password, name);
      if ('requiresEmailVerification' in result) return result;
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
      if ('requiresTwoFactor' in result) return result;
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
      /* still clear local session */
    }
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setUser(null);
    setOrgState(null);
  }, []);

  const refreshOrg = useCallback(async () => {
    const me = await authApi.me();
    setOrgState(me.org);
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await authApi.me();
    setUser(toAuthUser(me));
    setOrgState(me.org);
  }, []);

  const setOrg = useCallback((next: OrgSummary) => {
    setOrgState(next);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        user,
        org,
        signup,
        completeEmailVerification,
        resendEmailVerification,
        login,
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
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
