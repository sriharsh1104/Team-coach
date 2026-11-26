import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform, useColorScheme } from 'react-native';
import {
  ThemeColors,
  ThemeId,
  ThemePreference,
  getThemeColors,
  resolveThemeId,
  setThemeId as setGlobalThemeId,
} from '../theme';

const THEME_STORAGE_KEY = 'team-coach.themeId';

type ThemeContextValue = {
  /** User's stored choice (may be Automatic). */
  preference: ThemePreference;
  /** Resolved palette — never `system`. */
  themeId: ThemeId;
  colors: ThemeColors;
  setTheme: (id: ThemePreference) => void;
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue>({
  preference: 'black',
  themeId: 'black',
  colors: getThemeColors('black'),
  setTheme: () => undefined,
  ready: false,
});

function readNativeStore() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-secure-store') as typeof import('expo-secure-store');
}

function parsePreference(raw: string | null): ThemePreference | null {
  if (
    raw === 'white' ||
    raw === 'lavender' ||
    raw === 'black' ||
    raw === 'system'
  ) {
    return raw;
  }
  return null;
}

async function loadThemePreference(): Promise<ThemePreference> {
  try {
    const raw =
      Platform.OS === 'web'
        ? localStorage.getItem(THEME_STORAGE_KEY)
        : await readNativeStore().getItemAsync(THEME_STORAGE_KEY);
    return parsePreference(raw) ?? 'black';
  } catch {
    /* ignore */
  }
  return 'black';
}

async function persistThemePreference(id: ThemePreference) {
  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(THEME_STORAGE_KEY, id);
      return;
    }
    const SecureStore = readNativeStore();
    await SecureStore.setItemAsync(THEME_STORAGE_KEY, id, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  } catch {
    /* ignore */
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme();
  const [preference, setPreferenceState] =
    useState<ThemePreference>('black');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadThemePreference().then((id) => {
      if (cancelled) return;
      setPreferenceState(id);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const themeId = resolveThemeId(preference, colorScheme);

  useEffect(() => {
    setGlobalThemeId(themeId);
  }, [themeId]);

  const setTheme = useCallback((id: ThemePreference) => {
    setPreferenceState(id);
    void persistThemePreference(id);
  }, []);

  const value = useMemo(
    () => ({
      preference,
      themeId,
      colors: getThemeColors(themeId),
      setTheme,
      ready,
    }),
    [preference, themeId, setTheme, ready],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
