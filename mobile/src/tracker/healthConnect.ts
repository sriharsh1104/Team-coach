import { Linking, PermissionsAndroid, Platform } from 'react-native';

export type DeviceHealthSample = {
  steps: number;
  /** Active-minutes proxy for Google Fit–style Heart Points. */
  heartPoints: number | null;
  source: 'health_connect';
};

export type HealthConnectStatus =
  | 'unsupported'
  | 'unavailable'
  | 'needs_install'
  | 'needs_permission'
  | 'ready';

type HcModule = typeof import('react-native-health-connect');

const STEP_PERM = { accessType: 'read' as const, recordType: 'Steps' };
const EXERCISE_PERM = {
  accessType: 'read' as const,
  recordType: 'ExerciseSession',
};

function loadHc(): HcModule | null {
  if (Platform.OS !== 'android') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-health-connect') as HcModule;
  } catch {
    return null;
  }
}

/**
 * Vigorous exercise types from Health Connect's numeric ExerciseType enum
 * (string names never come back from the native SDK).
 */
const VIGOROUS_TYPES = new Set<number>([
  5, // BASKETBALL
  8, // BIKING
  9, // BIKING_STATIONARY
  11, // BOXING
  25, // ELLIPTICAL
  36, // HIIT
  37, // HIKING
  44, // MARTIAL_ARTS
  51, // ROCK_CLIMBING
  53, // ROWING
  54, // ROWING_MACHINE
  56, // RUNNING
  57, // RUNNING_TREADMILL
  64, // SOCCER
  68, // STAIR_CLIMBING
  69, // STAIR_CLIMBING_MACHINE
  73, // SWIMMING_OPEN_WATER
  74, // SWIMMING_POOL
  76, // TENNIS
  78, // VOLLEYBALL
]);

function startOfLocalDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfLocalDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function todayRange() {
  return {
    operator: 'between' as const,
    startTime: startOfLocalDay().toISOString(),
    endTime: endOfLocalDay().toISOString(),
  };
}

async function ensureInitialized(hc: HcModule): Promise<boolean> {
  try {
    return !!(await hc.initialize());
  } catch {
    return false;
  }
}

async function hasReadPermission(
  hc: HcModule,
  recordType: string,
): Promise<boolean> {
  try {
    const granted = await hc.getGrantedPermissions();
    return granted.some(
      (p) =>
        'recordType' in p &&
        p.recordType === recordType &&
        p.accessType === 'read',
    );
  } catch {
    return false;
  }
}

export async function getHealthConnectStatus(): Promise<HealthConnectStatus> {
  if (Platform.OS !== 'android') return 'unsupported';
  const hc = loadHc();
  if (!hc) return 'unavailable';
  try {
    const status = await hc.getSdkStatus();
    if (
      status === hc.SdkAvailabilityStatus.SDK_UNAVAILABLE ||
      status ===
        hc.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED
    ) {
      return 'needs_install';
    }
    const ok = await ensureInitialized(hc);
    if (!ok) return 'unavailable';
    const canReadSteps = await hasReadPermission(hc, 'Steps');
    return canReadSteps ? 'ready' : 'needs_permission';
  } catch {
    return 'unavailable';
  }
}

export async function requestHealthPermissions(): Promise<boolean> {
  const hc = loadHc();
  if (!hc) return false;
  try {
    if (Number(Platform.Version) >= 29) {
      await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION,
      );
    }
    const ok = await ensureInitialized(hc);
    if (!ok) return false;
    const result = await hc.requestPermission([STEP_PERM, EXERCISE_PERM]);
    return result.some(
      (p) => p.recordType === 'Steps' && p.accessType === 'read',
    );
  } catch {
    return false;
  }
}

export function openHealthConnectInstallOrSettings(): void {
  const hc = loadHc();
  if (!hc) {
    void Linking.openURL(
      'market://details?id=com.google.android.apps.healthdata',
    ).catch(() => undefined);
    return;
  }
  try {
    hc.openHealthConnectSettings();
  } catch {
    void Linking.openURL(
      'market://details?id=com.google.android.apps.healthdata',
    ).catch(() => undefined);
  }
}

async function readTodaySteps(hc: HcModule): Promise<number> {
  const timeRangeFilter = todayRange();
  try {
    const agg = await hc.aggregateRecord({
      recordType: 'Steps',
      timeRangeFilter,
    });
    const total = Number(
      (agg as { COUNT_TOTAL?: number }).COUNT_TOTAL ?? 0,
    );
    if (Number.isFinite(total)) return Math.max(0, Math.round(total));
  } catch {
    /* fall through to raw records */
  }

  const stepsRes = await hc.readRecords('Steps', { timeRangeFilter });
  let steps = 0;
  for (const row of stepsRes.records) {
    steps += Number(row.count ?? 0);
  }
  return Math.max(0, Math.round(steps));
}

async function readTodayHeartPoints(hc: HcModule): Promise<number | null> {
  const timeRangeFilter = todayRange();
  try {
    const exerciseRes = await hc.readRecords('ExerciseSession', {
      timeRangeFilter,
    });
    if (!exerciseRes.records.length) {
      // No logged workouts — still try duration aggregate (some devices only
      // expose that). Zero duration → null so UI can show "—".
      try {
        const agg = await hc.aggregateRecord({
          recordType: 'ExerciseSession',
          timeRangeFilter,
        });
        const seconds = Number(
          (agg as { EXERCISE_DURATION_TOTAL?: { inSeconds?: number } })
            .EXERCISE_DURATION_TOTAL?.inSeconds ?? 0,
        );
        if (!Number.isFinite(seconds) || seconds <= 0) return null;
        return Math.max(0, Math.round(seconds / 60));
      } catch {
        return null;
      }
    }

    let points = 0;
    for (const row of exerciseRes.records) {
      const start = Date.parse(row.startTime);
      const end = Date.parse(row.endTime);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        continue;
      }
      const minutes = Math.round((end - start) / 60_000);
      const typeNum = Number(row.exerciseType);
      const weight = VIGOROUS_TYPES.has(typeNum) ? 2 : 1;
      points += minutes * weight;
    }
    return points;
  } catch {
    return null;
  }
}

/**
 * Read today's steps + heart-point proxy from Health Connect.
 * Returns null only when HC is missing or Steps read is denied/fails.
 * Zero steps is a valid sample (user granted access, just hasn't walked yet).
 */
export async function readTodayHealth(): Promise<DeviceHealthSample | null> {
  const hc = loadHc();
  if (!hc) return null;
  try {
    const ok = await ensureInitialized(hc);
    if (!ok) return null;
    if (!(await hasReadPermission(hc, 'Steps'))) return null;

    const steps = await readTodaySteps(hc);
    const heartPoints = (await hasReadPermission(hc, 'ExerciseSession'))
      ? await readTodayHeartPoints(hc)
      : null;

    return { steps, heartPoints, source: 'health_connect' };
  } catch {
    return null;
  }
}
