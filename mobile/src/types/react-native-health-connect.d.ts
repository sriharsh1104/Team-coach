/**
 * Ambient typings so the app typechecks before `react-native-health-connect`
 * is installed (npm registry outages). Runtime still dynamic-requires the
 * real package in `tracker/healthConnect.ts`.
 */
declare module 'react-native-health-connect' {
  export const SdkAvailabilityStatus: {
    SDK_AVAILABLE: number;
    SDK_UNAVAILABLE: number;
    SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED: number;
  };

  export type Permission = {
    accessType: 'read' | 'write';
    recordType: string;
  };

  export function getSdkStatus(): Promise<number>;
  export function initialize(): Promise<boolean>;
  export function openHealthConnectSettings(): void;
  export function getGrantedPermissions(): Promise<Permission[]>;
  export function requestPermission(
    permissions: Array<{ accessType: 'read' | 'write'; recordType: string }>,
  ): Promise<Array<{ accessType: string; recordType: string }>>;
  export function readRecords(
    recordType: string,
    options: {
      timeRangeFilter: {
        operator: 'between';
        startTime: string;
        endTime: string;
      };
    },
  ): Promise<{
    records: Array<{
      count?: number;
      startTime: string;
      endTime: string;
      exerciseType?: string | number;
    }>;
  }>;
  export function aggregateRecord(request: {
    recordType: string;
    timeRangeFilter: {
      operator: 'between';
      startTime: string;
      endTime: string;
    };
  }): Promise<Record<string, unknown>>;
}
