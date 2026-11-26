import { apiClient } from './client';

export type HealthGoals = {
  stepGoal: number;
  heartGoal: number;
};

export type HealthToday = HealthGoals & {
  day: string;
  steps: number;
  heartPoints: number;
  source: string | null;
  syncedAt: string | null;
  stepsRemaining: number;
  heartRemaining: number;
};

export type RoutineRow = {
  id: string;
  title: string;
  timeLocal: string;
  alarmEnabled: boolean;
  sortOrder: number;
  doneToday: boolean;
  completedAt: string | null;
};

/** Local calendar day YYYY-MM-DD in the device timezone. */
export function localDay(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getHealthToday(day = localDay()) {
  return apiClient
    .get<HealthToday>('/tracker/health/today', { params: { day } })
    .then((res) => res.data);
}

export function upsertHealthDay(body: {
  day: string;
  steps: number;
  heartPoints?: number;
  source?: string;
}) {
  return apiClient
    .put<HealthToday>('/tracker/health/day', body)
    .then((res) => res.data);
}

export function updateHealthGoals(body: Partial<HealthGoals>) {
  return apiClient
    .patch<HealthGoals>('/tracker/health/goals', body)
    .then((res) => res.data);
}

export function listRoutines(day = localDay()) {
  return apiClient
    .get<RoutineRow[]>('/tracker/routines', { params: { day } })
    .then((res) => res.data);
}

export function createRoutine(body: {
  title: string;
  timeLocal: string;
  alarmEnabled?: boolean;
}) {
  return apiClient
    .post<RoutineRow>('/tracker/routines', body)
    .then((res) => res.data);
}

export function updateRoutine(
  id: string,
  body: {
    title?: string;
    timeLocal?: string;
    alarmEnabled?: boolean;
    active?: boolean;
  },
) {
  return apiClient
    .patch<RoutineRow>(`/tracker/routines/${id}`, body)
    .then((res) => res.data);
}

export function deleteRoutine(id: string) {
  return apiClient
    .delete<{ ok: boolean }>(`/tracker/routines/${id}`)
    .then((res) => res.data);
}

export function completeRoutine(id: string, day = localDay()) {
  return apiClient
    .post<{
      routineItemId: string;
      day: string;
      completedAt: string;
      doneToday: boolean;
    }>(`/tracker/routines/${id}/complete`, { day })
    .then((res) => res.data);
}

export function uncompleteRoutine(id: string, day = localDay()) {
  return apiClient
    .delete<{ routineItemId: string; day: string; doneToday: boolean }>(
      `/tracker/routines/${id}/complete`,
      { data: { day } },
    )
    .then((res) => res.data);
}
