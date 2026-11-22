import { apiClient } from './client';

export interface AdminOverview {
  orgs: number;
  users: number;
  verifiedUsers: number;
  admins: number;
  messages: number;
  scrims: number;
  newUsersLast7Days: number;
}

export interface AdminOrgRow {
  id: string;
  name: string;
  createdAt: string;
  rosterCount: number;
  guildCount: number;
  messageCount: number;
  owner: { id: string; name: string; email: string } | null;
}

export interface AdminOrgList {
  total: number;
  skip: number;
  take: number;
  orgs: AdminOrgRow[];
}

export interface AdminOrgDetail {
  id: string;
  name: string;
  createdAt: string;
  counts: {
    guildMembers: number;
    messages: number;
    scrims: number;
    mediaPosts: number;
    playerStats: number;
  };
  roster: {
    id: string;
    name: string;
    email: string;
    inGameName: string | null;
    avatarUrl: string | null;
    lastSeenAt: string | null;
    role: string | null;
    isOwner: boolean;
    joinedAt: string;
  }[];
}

export function getOverview() {
  return apiClient.get<AdminOverview>('/admin/overview').then((r) => r.data);
}

export function listOrgs(params: { search?: string; skip?: number; take?: number } = {}) {
  return apiClient.get<AdminOrgList>('/admin/orgs', { params }).then((r) => r.data);
}

export function getOrg(id: string) {
  return apiClient.get<AdminOrgDetail>(`/admin/orgs/${id}`).then((r) => r.data);
}
