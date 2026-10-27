import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { deleteToken, getToken, setToken } from '../storage/tokenStorage';
import * as authApi from '../api/auth';
import { AuthUser, OrgSummary } from '../api/types';
import { registerPushTokenWithBackend } from '../notifications/registerPushToken';

interface AuthContextValue {
  isLoading: boolean;
  user: AuthUser | null;
  org: OrgSummary | null;
  signup: (email: string, password: string, name: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
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
      const token = await getToken();
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const me = await authApi.me();
        setUser({
          id: me.id,
          email: me.email,
          name: me.name,
          avatarUrl: me.avatarUrl,
          phone: me.phone,
          profileComplete: me.profileComplete,
        });
        setOrgState(me.org);
        registerPushTokenWithBackend();
      } catch {
        await deleteToken();
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const applyAuthResponse = useCallback(
    async (response: { accessToken: string; user: AuthUser; org: OrgSummary | null }) => {
      await setToken(response.accessToken);
      setUser(response.user);
      setOrgState(response.org);
      registerPushTokenWithBackend();
    },
    [],
  );

  const signup = useCallback(
    async (email: string, password: string, name: string) => {
      const response = await authApi.signup(email, password, name);
      await applyAuthResponse(response);
    },
    [applyAuthResponse],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await authApi.login(email, password);
      await applyAuthResponse(response);
    },
    [applyAuthResponse],
  );

  const loginWithGoogle = useCallback(
    async (idToken: string) => {
      const response = await authApi.googleLogin(idToken);
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
  // requiring a full logout/login round trip.
  const refreshUser = useCallback(async () => {
    const me = await authApi.me();
    setUser({
      id: me.id,
      email: me.email,
      name: me.name,
      avatarUrl: me.avatarUrl,
      phone: me.phone,
      profileComplete: me.profileComplete,
    });
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
        signup,
        login,
        loginWithGoogle,
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
