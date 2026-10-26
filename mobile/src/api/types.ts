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

export interface MediaPost {
  id: string;
  type: 'IMAGE' | 'VIDEO';
  url: string;
  caption: string | null;
  createdAt: string;
  uploaderId: string;
  uploaderName: string;
}

export interface Device {
  id: string;
  name: string;
  model: string;
}

export interface Profile {
  id: string;
  name: string;
  avatarUrl: string | null;
  roles: string[];
  inGameName: string | null;
  inGameUid: string | null;
  whatsappUrl: string | null;
  instagramUrl: string | null;
  discordUrl: string | null;
  youtubeUrl: string | null;
  devices: Device[];
}

export interface UpdateProfileInput {
  roles?: string[];
  inGameName?: string;
  inGameUid?: string;
  whatsappUrl?: string;
  instagramUrl?: string;
  discordUrl?: string;
  youtubeUrl?: string;
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
