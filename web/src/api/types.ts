export type MembershipRole = 'PLAYER' | 'COACH' | 'ANALYST';

export type GuildRole = 'MEMBER' | 'ELDER' | 'ACTIVE_LEADER' | 'LEADER';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  phone: string | null;
  profileComplete: boolean;
  hasPassword: boolean;
  hasGoogle?: boolean;
  twoFactorEnabled: boolean;
  /**
   * Platform-wide admin. Display only — it decides whether the Admin link is
   * shown. Every /admin call is re-checked against the database on the
   * server, so flipping this in devtools gets you a link and then a 403.
   */
  isPlatformAdmin?: boolean;
}

export interface OrgSummary {
  id: string;
  name: string;
  role: MembershipRole | null;
  isOwner: boolean;
}

export interface GuildSummary {
  id: string;
  name: string;
  role: GuildRole;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
  org: OrgSummary | null;
  guild: GuildSummary | null;
  /** Set when Google just created the account and emailed the generated password. */
  passwordEmailSent?: boolean;
}

export interface TwoFactorChallengeResponse {
  requiresTwoFactor: true;
  challengeToken: string;
}

export type GoogleLoginResult = AuthResponse | TwoFactorChallengeResponse;

export type LoginResult =
  | GoogleLoginResult
  | EmailVerificationChallengeResponse;

export interface EmailVerificationChallengeResponse {
  requiresEmailVerification: true;
  challengeToken: string;
}

export type SignupResult = AuthResponse | EmailVerificationChallengeResponse;

export interface OrgMember {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: MembershipRole | null;
  isOwner: boolean;
  inGameName?: string | null;
  inGameRoles: string[];
}

export interface OrgCreateJoinResponse {
  id: string;
  name: string;
  orgCode: string;
  referralLink: string;
  rosterCode: string | null;
  rosterReferralLink: string | null;
  myRole: MembershipRole | null;
  isOwner: boolean;
}

export interface OrgDetail {
  id: string;
  name: string;
  orgCode: string;
  referralLink: string;
  /** Owner/coach only — distinct from guild orgCode. */
  rosterCode: string | null;
  /** Owner/coach only — `/join/<rosterToken>?seat=roster`. */
  rosterReferralLink: string | null;
  canInviteRoster: boolean;
  myRole: MembershipRole | null;
  isOwner: boolean;
  historyVisibleToNewMembers: boolean;
  members: OrgMember[];
}

export interface GuildJoinResponse {
  id: string;
  name: string;
  role: GuildRole;
}

export interface GuildRosterMember {
  userId: string;
  name: string;
  inGameName: string | null;
  role: MembershipRole | null;
  isOwner: boolean;
}

export interface GuildMemberRow {
  userId: string;
  name: string;
  inGameName: string | null;
  guildRole: GuildRole;
  onRoster: boolean;
  rosterRole: MembershipRole | null;
  isOwner: boolean;
}

/** Tournament grand-final finish shown on the Guild Achievements tab. */
export interface GuildAchievement {
  id: string;
  name: string;
  /** YYYY-MM-DD */
  date: string;
  grandFinalLink: string | null;
  standing: string;
  points: number | null;
}

export interface GuildDetail {
  id: string;
  name: string;
  orgCode: string | null;
  /** Free Fire in-game guild ID (digits), if the owner set one. */
  freeFireGuildId: string | null;
  /** Personal /join/<token>?ref=<me> link — guild join only, not roster. */
  referralLink: string | null;
  /** How many guild members joined via this user's invite link. */
  myInviteCount: number;
  myGuildRole: GuildRole;
  onRoster: boolean;
  canManageRoster: boolean;
  achievements: GuildAchievement[];
  roster: GuildRosterMember[];
  members: GuildMemberRow[];
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
  /** Free Fire IGN — used for @mentions in chat. */
  inGameName: string | null;
  channelKey: string;
}

export interface ChatChannelsResponse {
  channels: ChatChannel[];
  teammates: ChatTeammate[];
  /** @deprecated Prefer rosterMentionables / guildMentionables by channel. */
  mentionables: ChatTeammate[];
  /** Esports / team chat (@) — roster only. */
  rosterMentionables?: ChatTeammate[];
  /** Guild chat (@) — guild seats only. */
  guildMentionables?: ChatTeammate[];
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
  /** Null until the number is proven via Telegram verification. */
  phoneVerifiedAt?: string | null;
  whatsappUrl: string | null;
  instagramUrl: string | null;
  discordUrl: string | null;
  youtubeUrl: string | null;
  kickUrl: string | null;
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
  kickUrl?: string;
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

export interface PlayerStatEntry {
  id: string;
  userId: string;
  mode: StatMode;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  recordedAt: string;
}

export interface PlayerStatsDetail {
  mode: StatMode;
  totals: { kills: number; deaths: number; assists: number; damage: number };
  matches: number;
  entries: PlayerStatEntry[];
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
