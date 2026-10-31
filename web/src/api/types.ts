export type MembershipRole = 'PLAYER' | 'COACH' | 'ANALYST';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  phone: string | null;
  profileComplete: boolean;
  hasPassword: boolean;
  twoFactorEnabled: boolean;
}

export interface OrgSummary {
  id: string;
  name: string;
  role: MembershipRole;
  isOwner: boolean;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
  org: OrgSummary | null;
}

export interface TwoFactorChallengeResponse {
  requiresTwoFactor: true;
  challengeToken: string;
}

export type LoginResult = AuthResponse | TwoFactorChallengeResponse;

export interface EmailVerificationChallengeResponse {
  requiresEmailVerification: true;
  challengeToken: string;
}

export type SignupResult = AuthResponse | EmailVerificationChallengeResponse;

export interface OrgMember {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: MembershipRole;
  isOwner: boolean;
  inGameName?: string | null;
  inGameRoles: string[];
}

export interface OrgCreateJoinResponse {
  id: string;
  name: string;
  orgCode: string;
  referralLink: string;
  myRole: MembershipRole;
  isOwner: boolean;
}

export interface OrgDetail {
  id: string;
  name: string;
  orgCode: string;
  referralLink: string;
  myRole: MembershipRole;
  isOwner: boolean;
  historyVisibleToNewMembers: boolean;
  members: OrgMember[];
}

export interface ChatMessage {
  id: string;
  channelKey: string;
  senderId: string;
  senderName: string;
  senderRole: MembershipRole | null;
  senderIsOwner: boolean;
  text: string | null;
  mediaUrl: string | null;
  mediaType: 'IMAGE' | 'VIDEO' | null;
  createdAt: string;
}

export interface ChatChannel {
  channelKey: string;
  type: 'ORG' | 'DM';
  title: string;
  peerUserId: string | null;
  peerAvatarUrl: string | null;
  memberCount?: number | null;
  unreadCount: number;
  lastMessageAt: string | null;
  lastPreview: string | null;
}

export interface ChatTeammate {
  userId: string;
  name: string;
  avatarUrl: string | null;
  channelKey: string;
}

export interface ChatChannelsResponse {
  channels: ChatChannel[];
  teammates: ChatTeammate[];
  totalUnread: number;
}

export interface Profile {
  id: string;
  name: string;
  avatarUrl: string | null;
  roles: string[];
  inGameName: string | null;
  inGameUid: string | null;
  phone: string | null;
  whatsappUrl: string | null;
  instagramUrl: string | null;
  discordUrl: string | null;
  youtubeUrl: string | null;
  devices: Array<{ id: string; name: string; model: string }>;
  role: MembershipRole | null;
  isOwner: boolean;
}
