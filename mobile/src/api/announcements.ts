import { apiClient } from './client';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; avatarUrl: string | null } | null;
  /** Per-person — never reveals whether anyone else has opened it. */
  read: boolean;
}

export interface AnnouncementList {
  total: number;
  skip: number;
  take: number;
  unread: number;
  /** True only for the guild owner — the one account allowed to post. */
  canPost: boolean;
  announcements: Announcement[];
}

export function listAnnouncements(
  params: { skip?: number; take?: number } = {},
) {
  return apiClient
    .get<AnnouncementList>('/announcements', { params })
    .then((r) => r.data);
}

export function getUnreadCount() {
  return apiClient
    .get<{ unread: number }>('/announcements/unread')
    .then((r) => r.data.unread);
}

export function createAnnouncement(payload: { title: string; body: string }) {
  return apiClient
    .post<Announcement>('/announcements', payload)
    .then((r) => r.data);
}

export function markAllRead() {
  return apiClient
    .post<{ marked: number }>('/announcements/read')
    .then((r) => r.data);
}

export function deleteAnnouncement(id: string) {
  return apiClient.delete(`/announcements/${id}`).then((r) => r.data);
}
