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
  phone: string | null;
  whatsappUrl: string | null;
  instagramUrl: string | null;
  discordUrl: string | null;
  youtubeUrl: string | null;
  devices: Device[];
  role: MembershipRole | null;
  isOwner: boolean;
}

export interface UpdateProfileInput {
  name?: string;
  roles?: string[];
  inGameName?: string;
  inGameUid?: string;
  phone?: string;
  whatsappUrl?: string;
  instagramUrl?: string;
  discordUrl?: string;
  youtubeUrl?: string;
}

export type ScrimEventType = 'SCRIM' | 'TOURNAMENT';
export type ScrimRoundResult = 'PENDING' | 'QUALIFIED' | 'ELIMINATED';

export interface ScrimRound {
  id?: string;
  roundNumber: number;
  scheduledAt: string;
  result: ScrimRoundResult;
}

export interface ScrimEvent {
  id: string;
  type: ScrimEventType;
  title: string;
  scheduledAt: string;
  platform: string | null;
  notes: string | null;
  createdById: string;
  createdByName: string;
  remind30: boolean;
  remind10: boolean;
  rounds: ScrimRound[];
}

export interface ScrimEventInput {
  type: ScrimEventType;
  title: string;
  scheduledAt: string;
  platform?: string;
  notes?: string;
  remind30?: boolean;
  remind10?: boolean;
  rounds?: Array<{
    roundNumber: number;
    scheduledAt: string;
    result?: ScrimRoundResult;
  }>;
}

export type StatMode = 'BR' | 'CS' | 'SCRIM' | 'TOURNAMENT';

export const STAT_MODES: Array<{ mode: StatMode; label: string }> = [
  { mode: 'BR', label: 'BR' },
  { mode: 'CS', label: 'CS' },
  { mode: 'SCRIM', label: 'Scrims' },
  { mode: 'TOURNAMENT', label: 'Tournament' },
];

export type ExtractionStatus =
  | 'QUEUED'
  | 'PROCESSING'
  | 'PENDING'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'FAILED';

export interface ExtractionRow {
  rawName: string;
  matchedUserId: string | null;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
}

export interface StatExtraction {
  id: string;
  mode: StatMode;
  scrimEventId?: string | null;
  status: ExtractionStatus;
  failureReason: string | null;
  mediaUrl: string | null;
  rows: ExtractionRow[];
  createdAt: string;
}

export interface RequestExtractionsInput {
  mode: StatMode;
  mediaPostIds: string[];
  scrimEventId?: string;
}

export interface RequestExtractionsResponse {
  created: StatExtraction[];
  skipped: Array<{ mediaPostId: string; reason: string }>;
}

export interface LeaderboardRow {
  userId: string;
  name: string;
  mode?: StatMode;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  matches: number;
}

export interface ModeHistoryEntry {
  id: string;
  userId: string;
  name: string;
  mode: StatMode;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  recordedAt: string;
}

export interface ModeHistoryResponse {
  mode: StatMode;
  entries: ModeHistoryEntry[];
  nextCursor: string | null;
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
