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
  Profile: undefined;
  Members: undefined;
  GuildHome: undefined;
  Guild: undefined;
  OrgSettings: undefined;
  AccountSettings: undefined;
  /** Guild announcements — read by everyone, posted by the owner. */
  Announcements: undefined;
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
  GameRoom: { roomId: string; game?: 'rps' | 'ludo' | 'boots' };
  GoLive: undefined;
};
