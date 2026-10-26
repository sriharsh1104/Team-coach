import { ScrimEvent, StatExtraction } from '../api/types';

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
};

export type OrgSetupStackParamList = {
  OrgChoice: undefined;
  CreateOrg: undefined;
  JoinOrg: undefined;
};

export type MainStackParamList = {
  OrgHome: undefined;
  Profile: undefined;
  MemberProfile: { userId: string; name: string };
  MediaFeed: undefined;
  UploadMedia: undefined;
  Chat: undefined;
  Scrims: undefined;
  AddEditScrim: { scrim?: ScrimEvent } | undefined;
  Stats: undefined;
  ExtractionReview: { extraction: StatExtraction };
  PlayerStats: { userId: string; name: string };
  Voice: undefined;
};
