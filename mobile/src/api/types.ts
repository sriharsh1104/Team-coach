export type MembershipRole = 'PLAYER' | 'COACH';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface OrgSummary {
  id: string;
  name: string;
  role: MembershipRole;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
  org: OrgSummary | null;
}

export interface OrgMember {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: MembershipRole;
}

export interface OrgCreateJoinResponse {
  id: string;
  name: string;
  orgCode: string;
  referralLink: string;
  myRole: MembershipRole;
}

export interface OrgDetail {
  id: string;
  name: string;
  orgCode: string;
  referralLink: string;
  myRole: MembershipRole;
  members: OrgMember[];
}
