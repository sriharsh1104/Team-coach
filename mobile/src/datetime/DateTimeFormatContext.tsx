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
  DateFormatId,
  TimeFormatId,
  formatAppDateTime,
  formatDateOnly,
  formatTimeOnly,
} from './formats';

const DATE_KEY = 'team-coach.dateFormat';
const TIME_KEY = 'team-coach.timeFormat';

type DateTimeFormatContextValue = {
  dateFormat: DateFormatId;
  timeFormat: TimeFormatId;
  setDateFormat: (id: DateFormatId) => void;
  setTimeFormat: (id: TimeFormatId) => void;
  formatDate: (value: Date | string | number) => string;
  formatTime: (value: Date | string | number) => string;
  formatDateTime: (value: Date | string | number) => string;
  ready: boolean;
};

const DateTimeFormatContext = createContext<DateTimeFormatContextValue>({
  dateFormat: 'dmy',
  timeFormat: 'h12',
  setDateFormat: () => undefined,
  setTimeFormat: () => undefined,
  formatDate: (v) => formatDateOnly(v, 'dmy'),
  formatTime: (v) => formatTimeOnly(v, 'h12'),
  formatDateTime: (v) => formatAppDateTime(v, 'dmy', 'h12'),
  ready: false,
});

function readNativeStore() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-secure-store') as typeof import('expo-secure-store');
}

async function loadStored(): Promise<{
  dateFormat: DateFormatId;
  timeFormat: TimeFormatId;
}> {
  try {
    const get = async (key: string) =>
      Platform.OS === 'web'
        ? localStorage.getItem(key)
        : await readNativeStore().getItemAsync(key);
    const dateRaw = await get(DATE_KEY);
    const timeRaw = await get(TIME_KEY);
    return {
      dateFormat:
        dateRaw === 'mdy' || dateRaw === 'ymd' || dateRaw === 'dmy'
          ? dateRaw
          : 'dmy',
      timeFormat: timeRaw === 'h24' || timeRaw === 'h12' ? timeRaw : 'h12',
    };
  } catch {
    return { dateFormat: 'dmy', timeFormat: 'h12' };
  }
}

async function persist(key: string, value: string) {
  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    const SecureStore = readNativeStore();
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  } catch {
    /* ignore */
  }
}

export function DateTimeFormatProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [dateFormat, setDateFormatState] = useState<DateFormatId>('dmy');
  const [timeFormat, setTimeFormatState] = useState<TimeFormatId>('h12');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadStored().then((stored) => {
      if (cancelled) return;
      setDateFormatState(stored.dateFormat);
      setTimeFormatState(stored.timeFormat);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setDateFormat = useCallback((id: DateFormatId) => {
    setDateFormatState(id);
    void persist(DATE_KEY, id);
  }, []);

  const setTimeFormat = useCallback((id: TimeFormatId) => {
    setTimeFormatState(id);
    void persist(TIME_KEY, id);
  }, []);

  const value = useMemo(
    () => ({
      dateFormat,
      timeFormat,
      setDateFormat,
      setTimeFormat,
      formatDate: (v: Date | string | number) =>
        formatDateOnly(v, dateFormat),
      formatTime: (v: Date | string | number) =>
        formatTimeOnly(v, timeFormat),
      formatDateTime: (v: Date | string | number) =>
        formatAppDateTime(v, dateFormat, timeFormat),
      ready,
    }),
    [dateFormat, timeFormat, setDateFormat, setTimeFormat, ready],
  );

  return (
    <DateTimeFormatContext.Provider value={value}>
      {children}
    </DateTimeFormatContext.Provider>
  );
}

export function useDateTimeFormat() {
  return useContext(DateTimeFormatContext);
}
