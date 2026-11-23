import { Platform } from 'react-native';
import type { NavigationState } from '@react-navigation/native';

const NAV_STATE_KEY = 'team-coach.navState';
const DISK_FILE = 'team-coach.nav-state.json';

type NavPhase = 'auth' | 'profileSetup' | 'orgSetup' | 'guild' | 'main' | 'admin';
type Stored = { phase: NavPhase; state: NavigationState };

/** In-memory mirror so NavigationContainer can read sync on first paint. */
let memory: Stored | null = null;
let hydrateStarted = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

async function diskRead(): Promise<Stored | null> {
  try {
    if (Platform.OS === 'web') {
      const raw = localStorage.getItem(NAV_STATE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as Stored;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FileSystem = require('expo-file-system') as typeof import('expo-file-system');
    const path = `${FileSystem.documentDirectory}${DISK_FILE}`;
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(path);
    return JSON.parse(raw) as Stored;
  } catch {
    return null;
  }
}

async function diskWrite(payload: Stored) {
  try {
    const body = JSON.stringify(payload);
    if (Platform.OS === 'web') {
      localStorage.setItem(NAV_STATE_KEY, body);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FileSystem = require('expo-file-system') as typeof import('expo-file-system');
    const path = `${FileSystem.documentDirectory}${DISK_FILE}`;
    await FileSystem.writeAsStringAsync(path, body);
  } catch {
    /* private browsing / disk full */
  }
}

/** Call once at boot (App.tsx) so cold start can restore the last screen. */
export function hydrateNavPersist(): Promise<void> {
  if (hydrateStarted) return Promise.resolve();
  hydrateStarted = true;
  if (
    typeof jest !== 'undefined' ||
    process.env.NODE_ENV === 'test'
  ) {
    return Promise.resolve();
  }
  return diskRead().then((stored) => {
    if (stored?.phase && stored.state) memory = stored;
  });
}

export function loadPersistedNavState(
  phase: NavPhase,
): NavigationState | undefined {
  if (Platform.OS === 'web') {
    try {
      const raw = localStorage.getItem(NAV_STATE_KEY);
      if (!raw) return undefined;
      const parsed = JSON.parse(raw) as Stored;
      return parsed.phase === phase ? parsed.state : undefined;
    } catch {
      return undefined;
    }
  }
  if (memory?.phase === phase) return memory.state;
  return undefined;
}

export function persistNavState(
  phase: NavPhase,
  state: NavigationState | undefined,
) {
  if (!state) return;
  if (
    typeof jest !== 'undefined' ||
    process.env.NODE_ENV === 'test'
  ) {
    return;
  }
  memory = { phase, state };
  if (Platform.OS === 'web') {
    try {
      localStorage.setItem(NAV_STATE_KEY, JSON.stringify(memory));
    } catch {
      /* ignore */
    }
    return;
  }
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (memory) void diskWrite(memory);
  }, 350);
}
