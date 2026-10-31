import { apiClient } from './client';

export type RecordKind =
  | 'result'
  | 'qualified'
  | 'registered'
  | 'upcoming'
  | 'did_not_qualify'
  | 'skipped';

export type TournamentRecord = {
  id: string;
  name: string;
  status: string;
  kind: RecordKind;
  progress: string | null;
  qualifierDate: string | null;
  sortOrder: number;
};

export type TournamentRecordInput = {
  name: string;
  status: string;
  kind: RecordKind;
  progress?: string | null;
  qualifierDate?: string | null;
  sortOrder?: number;
};

export type TournamentRecordsPage = {
  items: TournamentRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export const DEFAULT_RECORDS_PAGE_SIZE = 10;

export function listPublicTournamentRecords(
  page = 1,
  pageSize = DEFAULT_RECORDS_PAGE_SIZE,
) {
  return apiClient
    .get<TournamentRecordsPage>('/public/tournament-records', {
      params: { page, pageSize },
    })
    .then((res) => res.data);
}

export function listTournamentRecords(
  page = 1,
  pageSize = DEFAULT_RECORDS_PAGE_SIZE,
) {
  return apiClient
    .get<TournamentRecordsPage>('/tournament-records', {
      params: { page, pageSize },
    })
    .then((res) => res.data);
}

export function createTournamentRecord(input: TournamentRecordInput) {
  return apiClient
    .post<TournamentRecord>('/tournament-records', input)
    .then((res) => res.data);
}

export function updateTournamentRecord(
  id: string,
  input: TournamentRecordInput,
) {
  return apiClient
    .patch<TournamentRecord>(`/tournament-records/${id}`, input)
    .then((res) => res.data);
}

export function deleteTournamentRecord(id: string) {
  return apiClient
    .delete<{ ok: boolean }>(`/tournament-records/${id}`)
    .then((res) => res.data);
}

export const RECORD_KINDS: Array<{ value: RecordKind; label: string }> = [
  { value: 'result', label: 'Result' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'registered', label: 'Registered' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'did_not_qualify', label: 'Did not qualify' },
  { value: 'skipped', label: 'Skipped' },
];
