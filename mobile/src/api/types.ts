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
   * Platform-wide admin. Display only — it decides whether the Admin drawer
   * item shows. Every /admin call is authorised server-side against the
   * database, so a faked flag here just yields a 403.
   */
  isPlatformAdmin?: boolean;
  /**
   * Admin-granted 1-on-1 voice. Display only — it decides whether the Direct
   * Voice section is drawn at all. The room token re-checks the permission on
   * BOTH people server-side, so a faked flag here reaches nobody.
   */
  canDirectVoice?: boolean;
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
  role: MembershipRole | null;
  isOwner: boolean;
  /** Free Fire IGN used to auto-match scoreboard OCR rows. */
  inGameName?: string | null;
  // In-game role tags (IGL/Sniper/...) — separate from the org role above.
  inGameRoles: string[];
}

export interface ChatReplyPreview {
  id: string;
  text: string | null;
  senderName: string;
  mediaType: 'IMAGE' | 'VIDEO' | 'AUDIO' | null;
}

export interface ChatReaction {
  emoji: string;
  count: number;
  userIds: string[];
  reactedByMe: boolean;
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
  mediaType: 'IMAGE' | 'VIDEO' | 'AUDIO' | null;
  createdAt: string;
  editedAt?: string | null;
  replyToId?: string | null;
  replyTo?: ChatReplyPreview | null;
  starred?: boolean;
  pinned?: boolean;
  /** True when this message was created via forward — client shows a label. */
  forwarded?: boolean;
  reactions?: ChatReaction[];
  /** Echoed from message:send so the sender can swap out an optimistic row. */
  clientId?: string;
}

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

export interface UserPresence {
  online: boolean;
  lastSeenAt: string | null;
}

export interface ChatChannelMeta {
  channelKey: string;
  description: string | null;
  avatarUrl: string | null;
  disappearAfterSec: number | null;
}

export interface ChatChannel {
  channelKey: string;
  type: 'ORG' | 'DM';
  title: string;
  peerUserId: string | null;
  peerAvatarUrl: string | null;
  /** Org group size (self included). Null for DMs. */
  memberCount?: number | null;
  unreadCount: number;
  lastMessageAt: string | null;
  lastPreview: string | null;
  muted?: boolean;
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
  phone: string | null;
  /** Null until the number is proven via Telegram verification. */
  phoneVerifiedAt?: string | null;
  whatsappUrl: string | null;
  instagramUrl: string | null;
  discordUrl: string | null;
  youtubeUrl: string | null;
  kickUrl: string | null;
  devices: Device[];
  // Org role/ownership — null when viewed somewhere with no org context.
  role: MembershipRole | null;
  isOwner: boolean;
}

export interface UpdateProfileInput {
  name?: string;
  roles?: string[];
  inGameName?: string;
  inGameUid?: string;
  /** Phone is set only via Telegram verification; the server refuses a new number here. */
  phone?: string;
  whatsappUrl?: string;
  instagramUrl?: string;
  discordUrl?: string;
  youtubeUrl?: string;
  kickUrl?: string;
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
  avatarUrl?: string | null;
  inGameName: string | null;
  guildRole: GuildRole;
  onRoster: boolean;
  rosterRole: MembershipRole | null;
  isOwner: boolean;
}

export interface GuildDetail {
  id: string;
  name: string;
  // Non-null only for owners / coaches / guild leadership — see GET /orgs/guild/me.
  orgCode: string | null;
  /** Personal invite link (`?ref=`) — joins guild only, not roster. */
  referralLink: string | null;
  /** Guild joins attributed to this user's invite link. */
  myInviteCount: number;
  myGuildRole: GuildRole;
  onRoster: boolean;
  canManageRoster: boolean;
  roster: GuildRosterMember[];
  members: GuildMemberRow[];
}

export interface GuildJoinResponse {
  id: string;
  name: string;
  role: GuildRole;
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

export interface VoiceRoom {
  id: string;
  name: string;
  url: string;
  token: string;
}

/** Someone already connected to a voice room (lobby / chat indicator). */
export interface VoiceOccupant {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface VoiceOccupancy {
  room: 'team' | 'guild';
  max: number;
  count: number;
  participants: VoiceOccupant[];
}

export type VoiceConfig =
  | {
      mode: 'self';
      /** Team = 5, guild = 50. */
      max?: number;
      room?: 'team' | 'guild';
    }
  | {
      mode: 'hosted';
      url: string;
      token: string;
      rooms?: VoiceRoom[];
      /** Which room the token is for (guild voice is its own LiveKit room). */
      room?: 'team' | 'guild';
      /** Server says this user is a host (owner / coach / guild leader). */
      canModerate?: boolean;
      /** Participant cap (team = 5, guild = 50). */
      max?: number;
    };

export type ExtractionStatus =
  | 'QUEUED'
  | 'PROCESSING'
  | 'PENDING'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'FAILED';

export type StatMode = 'BR' | 'CS' | 'SCRIM' | 'TOURNAMENT';

export const STAT_MODES: Array<{ mode: StatMode; label: string }> = [
  { mode: 'BR', label: 'BR' },
  { mode: 'CS', label: 'CS' },
  { mode: 'SCRIM', label: 'Scrims' },
  { mode: 'TOURNAMENT', label: 'Tournament' },
];

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

export interface PlayerStatsResponse {
  mode: StatMode;
  totals: { kills: number; deaths: number; assists: number; damage: number };
  matches: number;
  entries: Array<{
    id: string;
    kills: number;
    deaths: number;
    assists: number;
    damage: number;
    recordedAt: string;
  }>;
  nextCursor: string | null;
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
