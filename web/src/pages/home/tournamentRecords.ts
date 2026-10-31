export type TournamentResult = 'Champion' | 'Runner-up' | 'Top 4' | 'Top 8' | 'Participated';

export type TournamentRecord = {
  id: string;
  name: string;
  year: string;
  placement: TournamentResult;
  mode: string;
  notes?: string;
};

/** Public site copy — edit this list as Sacred posts results. */
export const TOURNAMENT_RECORDS: TournamentRecord[] = [
  {
    id: '1',
    name: 'Sacred Invitational Cup',
    year: '2026',
    placement: 'Champion',
    mode: 'BR Squad',
    notes: 'Full roster · coach-led prep block',
  },
  {
    id: '2',
    name: 'Regional Clash Series',
    year: '2026',
    placement: 'Top 4',
    mode: 'BR Squad',
    notes: 'Guest slot filled for finals week',
  },
  {
    id: '3',
    name: 'Community Open Qualifier',
    year: '2025',
    placement: 'Runner-up',
    mode: 'BR Squad',
  },
  {
    id: '4',
    name: 'Night Scrim League Finals',
    year: '2025',
    placement: 'Top 8',
    mode: 'BR Squad',
  },
  {
    id: '5',
    name: 'Campus Esports Showdown',
    year: '2025',
    placement: 'Participated',
    mode: 'CS Ranked',
  },
];
