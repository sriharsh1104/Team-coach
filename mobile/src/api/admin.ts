import { apiClient } from './client';

export interface AdminOverview {
  orgs: number;
  users: number;
  verifiedUsers: number;
  admins: number;
  messages: number;
  scrims: number;
  newUsersLast7Days: number;
  newUsersLast24Hours: number;
  guildMembers: number;
  rosterMembers: number;
  activeUsers24h: number;
  activeUsers7d: number;
  activeUsers30d: number;
  /** Live socket count — resets to 0 on a backend restart, by design. */
  onlineNow: number;
  pendingJoinRequests: number;
}

export interface AdminServiceCheck {
  key: string;
  label: string;
  status: 'up' | 'down' | 'off';
  /** 'live' was actually probed just now; 'config' only checks credentials. */
  kind: 'live' | 'config';
  detail: string;
  latencyMs?: number;
}

export interface AdminHealth {
  checkedAt: string;
  /** Live probes only — a missing credential is counted in needsAttention. */
  status: 'ok' | 'down';
  needsAttention: number;
  process: {
    env: string;
    nodeVersion: string;
    uptimeSeconds: number;
    startedAt: string;
    memoryMb: number;
    heapUsedMb: number;
  };
  services: AdminServiceCheck[];
}

export interface AdminOrgRow {
  id: string;
  name: string;
  orgCode: string;
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

export interface AdminMember {
  id: string;
  name: string;
  email: string;
  inGameName: string | null;
  inGameUid: string | null;
  avatarUrl: string | null;
  phone: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  emailVerified: boolean;
  role: string | null;
  joinedAt: string;
  online: boolean;
  /** 1-on-1 voice permission — admin-granted, needed on BOTH sides of a call. */
  canDirectVoice: boolean;
  /** Roster members only. */
  isOwner?: boolean;
  /** Guild members only — who shared the code/invite that brought them in. */
  invitedBy?: { id: string; name: string; email: string } | null;
}

export interface AdminOrgDetail {
  id: string;
  name: string;
  orgCode: string;
  rosterCode: string;
  createdAt: string;
  owner: { id: string; name: string; email: string } | null;
  counts: {
    guildMembers: number;
    rosterMembers: number;
    activeGuildMembers24h: number;
    messages: number;
    scrims: number;
    mediaPosts: number;
    playerStats: number;
    pendingJoinRequests: number;
  };
  guild: AdminMember[];
  roster: AdminMember[];
  pendingRequests: {
    id: string;
    requestedAt: string;
    user: { id: string; name: string; email: string };
  }[];
}

export interface AdminDirectVoiceUser {
  id: string;
  name: string;
  email: string;
  inGameName: string | null;
  avatarUrl: string | null;
  createdAt: string;
  /** A call needs both people in the SAME guild — null means they can call nobody. */
  guild: { id: string; name: string } | null;
}

export function listDirectVoiceUsers() {
  return apiClient
    .get<AdminDirectVoiceUser[]>('/admin/direct-voice')
    .then((r) => r.data);
}

/**
 * Grant or revoke 1-on-1 voice for one person. A grant to one side alone opens
 * nothing — the server checks the permission on both people when the call
 * token is minted.
 */
export function setDirectVoice(payload: {
  email?: string;
  userId?: string;
  enabled: boolean;
}) {
  return apiClient
    .post<{
      userId: string;
      name?: string;
      email?: string;
      canDirectVoice: boolean;
    }>('/admin/direct-voice', payload)
    .then((r) => r.data);
}

export function getOverview() {
  return apiClient.get<AdminOverview>('/admin/overview').then((r) => r.data);
}

export function getHealth() {
  return apiClient.get<AdminHealth>('/admin/health').then((r) => r.data);
}

export function listOrgs(
  params: { search?: string; skip?: number; take?: number } = {},
) {
  return apiClient.get<AdminOrgList>('/admin/orgs', { params }).then((r) => r.data);
}

export function getOrg(id: string) {
  return apiClient.get<AdminOrgDetail>(`/admin/orgs/${id}`).then((r) => r.data);
}
