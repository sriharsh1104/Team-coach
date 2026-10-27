import { apiClient } from './client';
import { MembershipRole, OrgCreateJoinResponse, OrgDetail } from './types';

export function createOrg(name: string, role: MembershipRole) {
  return apiClient
    .post<OrgCreateJoinResponse>('/orgs', { name, role })
    .then((res) => res.data);
}

// Joiners are always admitted as PLAYER — the owner promotes elevated roles.
export function joinOrg(code: { orgCode?: string; referralToken?: string }) {
  return apiClient
    .post<OrgCreateJoinResponse>('/orgs/join', code)
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
