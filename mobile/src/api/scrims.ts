import { apiClient } from './client';
import { ScrimEvent, ScrimEventInput } from './types';

export function listScrims() {
  return apiClient.get<ScrimEvent[]>('/scrims').then((res) => res.data);
}

export function createScrim(input: ScrimEventInput) {
  return apiClient
    .post<ScrimEvent>('/scrims', input)
    .then((res) => res.data);
}

export function updateScrim(id: string, input: Partial<ScrimEventInput>) {
  return apiClient
    .patch<ScrimEvent>(`/scrims/${id}`, input)
    .then((res) => res.data);
}

export function deleteScrim(id: string) {
  return apiClient.delete(`/scrims/${id}`);
}
