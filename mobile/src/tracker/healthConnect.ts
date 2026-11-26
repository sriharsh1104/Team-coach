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

function loadHc(): HcModule | null {
  if (Platform.OS !== 'android') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-health-connect') as HcModule;
  } catch {
    return null;
  }
}

/** Walking / light activity → 1 HP per minute; harder work → 2. */
const VIGOROUS = new Set([
  'RUNNING',
  'RUNNING_TREADMILL',
  'BIKING',
  'BIKING_STATIONARY',
  'SWIMMING_OPEN_WATER',
  'SWIMMING_POOL',
  'HIKING',
  'HIGH_INTENSITY_INTERVAL_TRAINING',
  'ROWING',
  'ROWING_MACHINE',
  'STAIR_CLIMBING',
  'STAIR_CLIMBING_MACHINE',
  'ELLIPTICAL',
  'SOCCER',
  'BASKETBALL',
  'TENNIS',
  'VOLLEYBALL',
  'MARTIAL_ARTS',
  'BOXING',
  'ROCK_CLIMBING',
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

export async function getHealthConnectStatus(): Promise<HealthConnectStatus> {
  if (Platform.OS !== 'android') return 'unsupported';
  const hc = loadHc();
  if (!hc) return 'unavailable';
  try {
    const status = await hc.getSdkStatus();
    if (status === hc.SdkAvailabilityStatus.SDK_UNAVAILABLE) {
      return 'needs_install';
    }
    if (status === hc.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
      return 'needs_install';
    }
    const ok = await hc.initialize();
    if (!ok) return 'unavailable';
    return 'ready';
  } catch {
    return 'unavailable';
  }
}

export async function requestHealthPermissions(): Promise<boolean> {
  const hc = loadHc();
  if (!hc) return false;
  try {
    if (Number(Platform.Version) >= 29) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION,
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        // Still try Health Connect — some devices only need HC grants.
      }
    }
    await hc.initialize();
    const result = await hc.requestPermission([
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'read', recordType: 'ExerciseSession' },
    ]);
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

/**
 * Read today's steps + heart-point proxy from Health Connect.
 * Returns null when HC is missing / denied / empty.
 */
export async function readTodayHealth(): Promise<DeviceHealthSample | null> {
  const hc = loadHc();
  if (!hc) return null;
  try {
    await hc.initialize();
    const timeRangeFilter = {
      operator: 'between' as const,
      startTime: startOfLocalDay().toISOString(),
      endTime: endOfLocalDay().toISOString(),
    };

    const stepsRes = await hc.readRecords('Steps', { timeRangeFilter });
    let steps = 0;
    for (const row of stepsRes.records) {
      steps += Number(row.count ?? 0);
    }

    let heartPoints: number | null = null;
    try {
      const exerciseRes = await hc.readRecords('ExerciseSession', {
        timeRangeFilter,
      });
      let points = 0;
      let any = false;
      for (const row of exerciseRes.records) {
        any = true;
        const start = Date.parse(row.startTime);
        const end = Date.parse(row.endTime);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
          continue;
        }
        const minutes = Math.round((end - start) / 60_000);
        const type = String(row.exerciseType ?? '').toUpperCase();
        const weight = VIGOROUS.has(type) ? 2 : 1;
        points += minutes * weight;
      }
      heartPoints = any ? points : null;
    } catch {
      heartPoints = null;
    }

    return { steps, heartPoints, source: 'health_connect' };
  } catch {
    return null;
  }
}
