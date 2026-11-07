import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';
import {
  ThemeColors,
  ThemeId,
  getThemeColors,
  setThemeId as setGlobalThemeId,
} from '../theme';

const THEME_STORAGE_KEY = 'team-coach.themeId';

type ThemeContextValue = {
  themeId: ThemeId;
  colors: ThemeColors;
  setTheme: (id: ThemeId) => void;
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue>({
  themeId: 'black',
  colors: getThemeColors('black'),
  setTheme: () => undefined,
  ready: false,
});

function readNativeStore() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-secure-store') as typeof import('expo-secure-store');
}

async function loadThemeId(): Promise<ThemeId> {
  try {
    const raw =
      Platform.OS === 'web'
        ? localStorage.getItem(THEME_STORAGE_KEY)
        : await readNativeStore().getItemAsync(THEME_STORAGE_KEY);
    if (raw === 'white' || raw === 'lavender' || raw === 'black') return raw;
  } catch {
    /* ignore */
  }
  return 'black';
}

async function persistThemeId(id: ThemeId) {
  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(THEME_STORAGE_KEY, id);
      return;
    }
    await readNativeStore().setItemAsync(THEME_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>('black');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadThemeId().then((id) => {
      if (cancelled) return;
      setGlobalThemeId(id);
      setThemeIdState(id);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setTheme = useCallback((id: ThemeId) => {
    setGlobalThemeId(id);
    setThemeIdState(id);
    void persistThemeId(id);
  }, []);

  const value = useMemo(
    () => ({
      themeId,
      colors: getThemeColors(themeId),
      setTheme,
      ready,
    }),
    [themeId, setTheme, ready],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
