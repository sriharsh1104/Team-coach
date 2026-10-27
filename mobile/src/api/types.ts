export type MembershipRole = 'PLAYER' | 'COACH' | 'ANALYST';

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
  isOwner: boolean;
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
  isOwner: boolean;
}

export interface ChatMessage {
  id: string;
  channelKey: string;
  senderId: string;
  senderName: string;
  // null when the sender has since left the org.
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
  isOwner: boolean;
}

export interface OrgDetail {
  id: string;
  name: string;
  orgCode: string;
  referralLink: string;
  myRole: MembershipRole;
  isOwner: boolean;
  members: OrgMember[];
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

export type VoiceConfig =
  | { mode: 'self' }
  | { mode: 'hosted'; url: string; token: string };

export type ExtractionStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED';

export interface ExtractionRow {
  rawName: string;
  matchedUserId: string | null;
  kills: number;
  deaths: number;
  assists: number;
}

export interface StatExtraction {
  id: string;
  status: ExtractionStatus;
  mediaUrl: string | null;
  rows: ExtractionRow[];
  createdAt: string;
}

export interface LeaderboardRow {
  userId: string;
  name: string;
  kills: number;
  deaths: number;
  assists: number;
  matches: number;
}

export interface PlayerStatsResponse {
  totals: { kills: number; deaths: number; assists: number };
  matches: number;
  entries: Array<{
    id: string;
    kills: number;
    deaths: number;
    assists: number;
    recordedAt: string;
  }>;
}
