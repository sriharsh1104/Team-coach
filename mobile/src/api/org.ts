import { apiClient } from './client';
import { MembershipRole, OrgCreateJoinResponse, OrgDetail } from './types';

export function createOrg(name: string, role: MembershipRole) {
  return apiClient
    .post<OrgCreateJoinResponse>('/orgs', { name, role })
    .then((res) => res.data);
}

export function joinOrg(
  role: MembershipRole,
  code: { orgCode?: string; referralToken?: string },
) {
  return apiClient
    .post<OrgCreateJoinResponse>('/orgs/join', { ...code, role })
    .then((res) => res.data);
}

export function getMyOrg() {
  return apiClient.get<OrgDetail>('/orgs/me').then((res) => res.data);
}
