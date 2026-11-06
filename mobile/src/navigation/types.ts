import { ScrimEvent, StatExtraction, StatMode } from '../api/types';

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  TwoFactorChallenge: { challengeToken: string };
  EmailVerification: { challengeToken: string };
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
  Guild: undefined;
  OrgSettings: undefined;
  AccountSettings: undefined;
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
  Maps: undefined;
  RuleBook: undefined;
  PointsTable: undefined;
  SocialHandles: undefined;
};
