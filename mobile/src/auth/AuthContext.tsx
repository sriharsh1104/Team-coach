import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TOKEN_STORAGE_KEY } from '../api/client';
import * as authApi from '../api/auth';
import { AuthUser, OrgSummary } from '../api/types';

interface AuthContextValue {
  isLoading: boolean;
  user: AuthUser | null;
  org: OrgSummary | null;
  signup: (email: string, password: string, name: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshOrg: () => Promise<void>;
  setOrg: (org: OrgSummary) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [org, setOrgState] = useState<OrgSummary | null>(null);

  useEffect(() => {
    (async () => {
      const token = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
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
        });
        setOrgState(me.org);
      } catch {
        await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const applyAuthResponse = useCallback(
    async (response: { accessToken: string; user: AuthUser; org: OrgSummary | null }) => {
      await AsyncStorage.setItem(TOKEN_STORAGE_KEY, response.accessToken);
      setUser(response.user);
      setOrgState(response.org);
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
    await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
    setUser(null);
    setOrgState(null);
  }, []);

  const refreshOrg = useCallback(async () => {
    const me = await authApi.me();
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
