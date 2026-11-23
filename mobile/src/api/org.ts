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

/** Owner sets / clears the Free Fire guild ID shown on the Guild screen. */
export function setFreeFireGuildId(freeFireGuildId: string | null) {
  return apiClient
    .patch<{ freeFireGuildId: string | null }>('/orgs/guild/freefire', {
      freeFireGuildId,
    })
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

/** Guild invite — guild seat only (orgId from browse / orgCode / referralToken). */
export function joinGuild(code: {
  orgId?: string;
  orgCode?: string;
  referralToken?: string;
  invitedByUserId?: string;
}) {
  return apiClient
    .post<GuildJoinResponse>('/orgs/guild/join', code)
    .then((res) => res.data);
}

export type GuildJoinRequestStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'REJECTED'
  /** Withdrawn because this person was accepted somewhere else. */
  | 'SUPERSEDED';

export type BrowseGuild = {
  id: string;
  name: string;
  /** The guild chat's group photo, used as the org logo in the list. */
  logoUrl: string | null;
  memberCount: number;
  rosterCount: number;
  createdAt: string;
  /** Where the caller's own request to this guild stands (null = never asked). */
  requestStatus: GuildJoinRequestStatus | null;
};

export type MyGuildJoinRequest = {
  id: string;
  orgId: string;
  orgName: string;
  status: GuildJoinRequestStatus;
  createdAt: string;
};

export type IncomingGuildJoinRequest = {
  id: string;
  userId: string;
  name: string;
  inGameName: string | null;
  avatarUrl: string | null;
  createdAt: string;
};

/**
 * Ask an org's leadership to let you in. Joining straight from the list is
 * not possible — only a guild code or invite link joins outright.
 */
export function requestGuildJoin(orgId: string) {
  return apiClient
    .post<{ status: GuildJoinRequestStatus; orgId: string; orgName: string }>(
      '/orgs/guild/request',
      { orgId },
    )
    .then((res) => res.data);
}

export function myGuildJoinRequests() {
  return apiClient
    .get<{ requests: MyGuildJoinRequest[] }>('/orgs/guild/requests/mine')
    .then((res) => res.data);
}

export function cancelGuildJoinRequest(requestId: string) {
  return apiClient
    .post<{ cancelled: boolean }>('/orgs/guild/requests/cancel', { requestId })
    .then((res) => res.data);
}

/** Pending requests waiting on this org's leadership. */
export function listGuildJoinRequests() {
  return apiClient
    .get<{ requests: IncomingGuildJoinRequest[] }>('/orgs/guild/requests')
    .then((res) => res.data);
}

export function decideGuildJoinRequest(requestId: string, accept: boolean) {
  return apiClient
    .post<{ status: GuildJoinRequestStatus }>('/orgs/guild/requests/decide', {
      requestId,
      accept,
    })
    .then((res) => res.data);
}

/** Guilds you can join when you are not in one yet. */
export function browseGuilds(q?: string) {
  return apiClient
    .get<{ guilds: BrowseGuild[] }>('/orgs/guild/browse', {
      params: q?.trim() ? { q: q.trim() } : undefined,
      skipErrorToast: true,
    } as Record<string, unknown>)
    .then((res) => res.data);
}

/** Leave current guild and drop that org’s roster seat. */
export function leaveGuild() {
  return apiClient
    .post<{ left: boolean; orgId: string; name: string }>('/orgs/guild/leave')
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
