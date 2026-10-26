import { apiClient } from './client';
import {
  ExtractionRow,
  LeaderboardRow,
  PlayerStatsResponse,
  StatExtraction,
} from './types';

export function requestExtraction(mediaPostId: string) {
  return apiClient
    .post<StatExtraction>('/stats/extractions', { mediaPostId })
    .then((res) => res.data);
}

export function listExtractions() {
  return apiClient
    .get<StatExtraction[]>('/stats/extractions')
    .then((res) => res.data);
}

export function updateExtractionRows(id: string, rows: ExtractionRow[]) {
  return apiClient
    .patch<StatExtraction>(`/stats/extractions/${id}`, { rows })
    .then((res) => res.data);
}

export function confirmExtraction(id: string) {
  return apiClient
    .post<{ confirmedRows: number; skippedRows: number }>(
      `/stats/extractions/${id}/confirm`,
    )
    .then((res) => res.data);
}

export function rejectExtraction(id: string) {
  return apiClient.post(`/stats/extractions/${id}/reject`);
}

export function getLeaderboard() {
  return apiClient
    .get<LeaderboardRow[]>('/stats/leaderboard')
    .then((res) => res.data);
}

export function getPlayerStats(userId: string) {
  return apiClient
    .get<PlayerStatsResponse>(`/stats/players/${userId}`)
    .then((res) => res.data);
}
