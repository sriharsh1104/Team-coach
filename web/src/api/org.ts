import { apiClient } from './client';
import {
  GuildDetail,
  GuildJoinResponse,
  MembershipRole,
  OrgCreateJoinResponse,
  OrgDetail,
} from './types';

export function createOrg(name: string) {
  return apiClient
    .post<OrgCreateJoinResponse>('/orgs', { name })
    .then((res) => res.data);
}

export function setOwnRosterRole(role: MembershipRole | null) {
  return apiClient
    .patch<{ role: MembershipRole | null }>('/orgs/me/role', { role })
    .then((res) => res.data);
}

export function joinOrg(code: { orgCode?: string; referralToken?: string }) {
  return apiClient
    .post<OrgCreateJoinResponse>('/orgs/join', code)
    .then((res) => res.data);
}

export function getMyOrg() {
  return apiClient.get<OrgDetail>('/orgs/me').then((res) => res.data);
}

export function joinGuild(code: { orgCode?: string; referralToken?: string }) {
  return apiClient
    .post<GuildJoinResponse>('/orgs/guild/join', code)
    .then((res) => res.data);
}

export function getMyGuild() {
  return apiClient.get<GuildDetail>('/orgs/guild/me').then((res) => res.data);
}

export function addGuildMemberToRoster(targetUserId: string, role: MembershipRole) {
  return apiClient
    .post('/orgs/guild/roster', { targetUserId, role })
    .then((res) => res.data);
}

export function removeFromRoster(targetUserId: string) {
  return apiClient
    .post('/orgs/guild/roster/remove', { targetUserId })
    .then((res) => res.data);
}
