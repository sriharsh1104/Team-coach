import { apiClient } from './client';
import {
  ExtractionRow,
  LeaderboardRow,
  ModeHistoryResponse,
  PlayerStatsResponse,
  RequestExtractionsInput,
  RequestExtractionsResponse,
  StatExtraction,
  StatMode,
} from './types';

// Fast, OCR-free write — each screenshot is created as QUEUED and OCR'd
// later in the background; poll getExtraction or check listExtractions to
// see when it's ready for review.
export function requestExtractions(input: RequestExtractionsInput) {
  return apiClient
    .post<RequestExtractionsResponse>('/stats/extractions', input)
    .then((res) => res.data);
}

export function listExtractions(mode?: StatMode) {
  return apiClient
    .get<StatExtraction[]>('/stats/extractions', {
      params: mode ? { mode } : {},
    })
    .then((res) => res.data);
}

export function getExtraction(id: string) {
  return apiClient
    .get<StatExtraction>(`/stats/extractions/${id}`)
    .then((res) => res.data);
}

export function retryExtraction(id: string) {
  return apiClient
    .post<StatExtraction>(`/stats/extractions/${id}/retry`)
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

export function getLeaderboard(mode: StatMode) {
  return apiClient
    .get<LeaderboardRow[]>('/stats/leaderboard', { params: { mode } })
    .then((res) => res.data);
}

export function getModeHistory(
  mode: StatMode,
  pagination?: { cursor?: string; limit?: number },
) {
  return apiClient
    .get<ModeHistoryResponse>('/stats/history', {
      params: { mode, ...pagination },
    })
    .then((res) => res.data);
}

export function getPlayerStats(
  userId: string,
  mode: StatMode,
  pagination?: { cursor?: string; limit?: number },
) {
  return apiClient
    .get<PlayerStatsResponse>(`/stats/players/${userId}`, {
      params: { mode, ...pagination },
    })
    .then((res) => res.data);
}
