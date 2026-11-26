import { ScrimEvent, StatExtraction, StatMode } from '../api/types';

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  TwoFactorChallenge: { challengeToken: string };
  EmailVerification: { challengeToken: string };
  ForgotPassword: undefined;
  ResetPassword: { email: string };
};

export type OrgSetupStackParamList = {
  OrgChoice: undefined;
  CreateOrg: undefined;
  JoinOrg: undefined;
};

export type ProfileSetupStackParamList = {
  CompleteProfile: undefined;
};

export type MainStackParamList = {
  OrgHome: undefined;
  /** `edit: true` opens sections ready to save (Settings → Edit). */
  Profile: { edit?: boolean } | undefined;
  Members: undefined;
  GuildHome: undefined;
  Guild: undefined;
  OrgSettings: undefined;
  /** Unified settings hub (gear) — profile, security, theme, logout. */
  Settings: undefined;
  AccountSettings: undefined;
  /** Self-service deactivate / permanent delete. */
  AccountLifecycle: undefined;
  /** In-app FAQ for Sacred Team Coach. */
  HelpSupport: undefined;
  /** Guild announcements — read by everyone, posted by the owner. */
  Announcements: undefined;
  /** Guild trophy shelf — grand finals; owner adds, everyone reads. */
  Achievements: undefined;
  /** Platform admin — only reachable when the server says isPlatformAdmin. */
  Admin: undefined;
  /** 1-on-1 voice — only reachable when the server says canDirectVoice.
   * Optional peer jumps straight into a call (e.g. from a DM header). */
  DirectVoice:
    | {
        peerId: string;
        peerName?: string;
        peerAvatarUrl?: string | null;
      }
    | undefined;
  TwoFactorSetup: undefined;
  Permissions: undefined;
  MemberProfile: { userId: string; name: string };
  MediaFeed: undefined;
  Chat: { channelKey?: string } | undefined;
  Scrims: undefined;
  AddEditScrim: {
    scrim?: ScrimEvent;
    defaultType?: 'SCRIM' | 'TOURNAMENT';
    /** After result upload: open editor ready to schedule the next round. */
    promptNextRound?: boolean;
  } | undefined;
  Stats: { mode?: StatMode } | undefined;
  ExtractionReview: {
    extraction: StatExtraction;
    scrimEvent?: ScrimEvent;
  };
  PlayerStats: { userId: string; name: string; mode: StatMode };
  Voice: undefined;
  GuildVoice: undefined;
  Maps: undefined;
  RuleBook: undefined;
  PointsTable: undefined;
  SocialHandles: undefined;
  Games: undefined;
  GamesLeaderboard: undefined;
  GameRoom: {
    roomId: string;
    game?: 'rps' | 'ludo' | 'boots' | 'cut' | 'chess' | 'uno' | 'race';
  };
  GoLive: undefined;
  /** Personal habit tracker — steps / heart points from Health Connect. */
  Health: undefined;
  /** Timed daily tasks with device alarms + mark-done. */
  DailyRoutine: undefined;
};
