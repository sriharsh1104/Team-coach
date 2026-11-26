import * as Notifications from 'expo-notifications';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import type { RoutineRow } from '../api/tracker';

export type AlarmScheduleItem = {
  id: string;
  title: string;
  /** 0–23 */
  hour: number;
  /** 0–59 */
  minute: number;
};

type NativeRoutineAlarms = {
  scheduleAll: (items: AlarmScheduleItem[]) => Promise<boolean>;
  cancelAll: () => Promise<boolean>;
  canScheduleExactAlarms: () => boolean;
  openExactAlarmSettings: () => void;
};

function loadNative(): NativeRoutineAlarms | null {
  if (Platform.OS !== 'android') return null;
  try {
    return requireOptionalNativeModule<NativeRoutineAlarms>('RoutineAlarms');
  } catch {
    return null;
  }
}

const native = loadNative();

export function parseTimeLocal(timeLocal: string): { hour: number; minute: number } | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeLocal);
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

export function formatTimeLocal(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function canUseExactAlarms(): boolean {
  if (!native) return false;
  try {
    return native.canScheduleExactAlarms();
  } catch {
    return false;
  }
}

export function openExactAlarmSettings(): void {
  native?.openExactAlarmSettings();
}

function toScheduleItems(routines: RoutineRow[]): AlarmScheduleItem[] {
  const out: AlarmScheduleItem[] = [];
  for (const r of routines) {
    if (!r.alarmEnabled || r.doneToday) continue;
    const t = parseTimeLocal(r.timeLocal);
    if (!t) continue;
    out.push({
      id: r.id,
      title: r.title,
      hour: t.hour,
      minute: t.minute,
    });
  }
  return out;
}

/**
 * Schedule Android AlarmManager alarms for enabled, not-yet-done routines.
 * Falls back to Expo local daily notifications when exact alarms are denied
 * or the native module is missing.
 */
export async function syncRoutineAlarms(routines: RoutineRow[]): Promise<{
  mode: 'exact' | 'notification' | 'none';
}> {
  const items = toScheduleItems(routines);

  if (Platform.OS !== 'android') {
    await syncFallbackNotifications(items);
    return { mode: items.length ? 'notification' : 'none' };
  }

  if (native && canUseExactAlarms()) {
    try {
      await native.scheduleAll(items);
      await clearFallbackNotifications();
      return { mode: items.length ? 'exact' : 'none' };
    } catch {
      // fall through to notifications
    }
  }

  if (native) {
    try {
      await native.cancelAll();
    } catch {
      // ignore
    }
  }

  await syncFallbackNotifications(items);
  return { mode: items.length ? 'notification' : 'none' };
}

const FALLBACK_PREFIX = 'routine-fallback-';

async function clearFallbackNotifications() {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => String(n.identifier).startsWith(FALLBACK_PREFIX))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {
    // ignore
  }
}

async function syncFallbackNotifications(items: AlarmScheduleItem[]) {
  await clearFallbackNotifications();
  if (Platform.OS === 'web') return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      await Notifications.requestPermissionsAsync();
    }
    for (const item of items) {
      await Notifications.scheduleNotificationAsync({
        identifier: `${FALLBACK_PREFIX}${item.id}`,
        content: {
          title: item.title,
          body: 'Daily routine reminder',
          sound: true,
          data: { type: 'routine_alarm', routineId: item.id },
        },
        trigger: {
          type: 'daily',
          hour: item.hour,
          minute: item.minute,
        } as Notifications.NotificationTriggerInput,
      });
    }
  } catch {
    // ignore — alarms are best-effort
  }
}
