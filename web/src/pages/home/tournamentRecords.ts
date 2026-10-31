import type { RecordKind } from '../../api/tournamentRecords';

export type FallbackTournamentRecord = {
  id: string;
  name: string;
  status: string;
  kind: RecordKind;
  progress?: string;
  qualifierDate?: string;
};

/** Offline / API-down fallback — same Sacred sheet seed. */
export const FALLBACK_TOURNAMENT_RECORDS: FallbackTournamentRecord[] = [
  {
    id: '1',
    name: 'Today weekly war GF 1k 9pm',
    status: 'Top 7',
    kind: 'result',
    progress: 'Finished Top 7',
  },
  {
    id: '2',
    name: 'HC 5k tournament',
    status: 'Upcoming',
    kind: 'upcoming',
  },
  {
    id: '3',
    name: 'Apex Cup S1 open qualifier',
    status: 'Qualifier',
    kind: 'upcoming',
    qualifierDate: '26 Oct',
  },
  {
    id: '4',
    name: 'RNX tournament',
    status: 'Upcoming',
    kind: 'upcoming',
  },
  {
    id: '5',
    name: 'Team Elite Cup',
    status: 'Upcoming',
    kind: 'upcoming',
  },
  {
    id: '6',
    name: 'Google Arena Cup',
    status: 'Upcoming',
    kind: 'upcoming',
  },
  {
    id: '7',
    name: 'Dushera Cup (Reaganverse)',
    status: 'Qualified',
    kind: 'qualified',
    progress: 'Qualify for final',
    qualifierDate: 'Today qualifier',
  },
  {
    id: '8',
    name: 'Reaganverse SS2',
    status: 'Did not qualify',
    kind: 'did_not_qualify',
    progress: "Didn't qualify for grand final",
  },
  {
    id: '9',
    name: 'Reaganverse Arena Clash',
    status: 'Did not qualify',
    kind: 'did_not_qualify',
    progress: "Didn't qualify for grand",
  },
  {
    id: '10',
    name: 'Havoc Cup',
    status: 'Skipped',
    kind: 'skipped',
    progress: 'No playing — timing issues',
  },
  {
    id: '11',
    name: 'Aura Cup COCS2',
    status: 'Qualified',
    kind: 'qualified',
    progress: 'Qualified till round 4',
  },
  {
    id: '12',
    name: '10k Quarter Final (DG)',
    status: 'Did not qualify',
    kind: 'did_not_qualify',
    progress: "Didn't qualify semi",
  },
  {
    id: '13',
    name: '6k BOL',
    status: 'Did not qualify',
    kind: 'did_not_qualify',
    progress: "Didn't qualify",
  },
  {
    id: '14',
    name: 'Apex Come Back Series',
    status: 'Registered',
    kind: 'registered',
  },
  {
    id: '15',
    name: 'Univ Esports 1.5 Lakh Tournament',
    status: 'Registered',
    kind: 'registered',
  },
  {
    id: '16',
    name: 'Apex 5k Tournament',
    status: 'Final',
    kind: 'qualified',
    progress:
      'Qualify for next round → Semi final → Final (choked in final)',
  },
  {
    id: '17',
    name: 'Leos Tournament Arena',
    status: 'Registered',
    kind: 'registered',
  },
  {
    id: '18',
    name: 'Google Arena Cup (Club Orangutan Elite)',
    status: 'Registered',
    kind: 'registered',
    qualifierDate: '1 Nov',
    progress: 'Qualifier scheduled',
  },
];
