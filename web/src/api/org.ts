import { apiClient } from './client';
import {
  GuildAchievement,
  GuildDetail,
  GuildJoinResponse,
  MembershipRole,
  OrgCreateJoinResponse,
  OrgDetail,
} from './types';

export function createOrg(
  name: string,
  opts?: { freeFireGuildId?: string },
) {
  return apiClient
    .post<OrgCreateJoinResponse>('/orgs', {
      name,
      ...(opts?.freeFireGuildId ? { freeFireGuildId: opts.freeFireGuildId } : {}),
    })
    .then((res) => res.data);
}

export function setFreeFireGuildId(freeFireGuildId: string | null) {
  return apiClient
    .patch<{ freeFireGuildId: string | null }>('/orgs/guild/freefire', {
      freeFireGuildId,
    })
    .then((res) => res.data);
}

export function setOwnRosterRole(role: MembershipRole | null) {
  return apiClient
    .patch<{ role: MembershipRole | null }>('/orgs/me/role', { role })
    .then((res) => res.data);
}

export function joinOrg(code: {
  rosterCode?: string;
  orgCode?: string;
  referralToken?: string;
}) {
  return apiClient
    .post<OrgCreateJoinResponse>('/orgs/join', code)
    .then((res) => res.data);
}

export function getMyOrg() {
  return apiClient.get<OrgDetail>('/orgs/me').then((res) => res.data);
}

export function joinGuild(code: {
  orgCode?: string;
  referralToken?: string;
  invitedByUserId?: string;
}) {
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

export function createGuildAchievement(input: {
  name: string;
  date: string;
  standing: string;
  points?: number;
  grandFinalLink?: string;
}) {
  return apiClient
    .post<GuildAchievement>('/orgs/guild/achievements', {
      name: input.name,
      date: input.date,
      standing: input.standing,
      ...(input.points != null ? { points: input.points } : {}),
      ...(input.grandFinalLink ? { grandFinalLink: input.grandFinalLink } : {}),
    })
    .then((res) => res.data);
}

export function deleteGuildAchievement(id: string) {
  return apiClient
    .delete<{ deleted: boolean }>(`/orgs/guild/achievements/${id}`)
    .then((res) => res.data);
}
