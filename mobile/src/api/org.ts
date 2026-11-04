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

/** Esports roster invite — uses rosterCode / rosterReferralToken. */
export function joinOrg(code: {
  rosterCode?: string;
  orgCode?: string;
  referralToken?: string;
}) {
  return apiClient
    .post<OrgCreateJoinResponse>('/orgs/join', code)
    .then((res) => res.data);
}

/** Guild invite — guild seat only (orgCode / guild referralToken). */
export function joinGuild(code: {
  orgCode?: string;
  referralToken?: string;
  invitedByUserId?: string;
}) {
  return apiClient
    .post<GuildJoinResponse>('/orgs/guild/join', code)
    .then((res) => res.data);
}

export function getMyOrg() {
  return apiClient.get<OrgDetail>('/orgs/me').then((res) => res.data);
}

export function changeMemberRole(targetUserId: string, role: MembershipRole) {
  return apiClient
    .patch<{ userId: string; role: MembershipRole }>('/orgs/members/role', {
      targetUserId,
      role,
    })
    .then((res) => res.data);
}

export function transferOwnership(targetUserId: string) {
  return apiClient
    .post('/orgs/transfer-ownership', { targetUserId })
    .then(() => undefined);
}

export function removeMember(targetUserId: string) {
  return apiClient
    .post('/orgs/members/remove', { targetUserId })
    .then(() => undefined);
}

export function updateOrgSettings(historyVisibleToNewMembers: boolean) {
  return apiClient
    .patch<{ historyVisibleToNewMembers: boolean }>('/orgs/settings', {
      historyVisibleToNewMembers,
    })
    .then((res) => res.data);
}

// Anyone already on the roster is auto-enrolled in the guild the first time
// this is called (see org.service.ts's getMyGuild) — there's no separate
// "join the guild" step for existing org members, only for someone who has
// neither a roster seat nor a guild seat yet (not reachable from this app,
// since mobile only reaches the main stack once an org exists).
export function getMyGuild() {
  return apiClient.get<GuildDetail>('/orgs/guild/me').then((res) => res.data);
}

export function addGuildMemberToRoster(targetUserId: string, role: MembershipRole) {
  return apiClient
    .post<{ userId: string; role: MembershipRole }>('/orgs/guild/roster', {
      targetUserId,
      role,
    })
    .then((res) => res.data);
}

export function removeFromGuildRoster(targetUserId: string) {
  return apiClient
    .post('/orgs/guild/roster/remove', { targetUserId })
    .then(() => undefined);
}
