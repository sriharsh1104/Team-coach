export type TeamPlayer = {
  id: string;
  name: string;
  ign: string;
  role: string;
  inGameRoles: string[];
  bio: string;
};

/** Public Sacred roster. */
export const TEAM_PLAYERS: TeamPlayer[] = [
  {
    id: 'p1',
    name: 'SRI',
    ign: 'SES-SRI',
    role: 'Owner Cum Mentor',
    inGameRoles: ['Owner Cum Mentor'],
    bio: 'Owns and mentors the Sacred pack — discipline, review, and long-term roster direction.',
  },
  {
    id: 'p2',
    name: 'MUFASA',
    ign: 'SES-MUFASA07',
    role: 'Player',
    inGameRoles: ['SNIPER'],
    bio: 'Sniper lane — long-range picks and mid-to-late zone info for the pack.',
  },
  {
    id: 'p3',
    name: 'NEPEX',
    ign: 'SES-NEPEX07!',
    role: 'Player',
    inGameRoles: ['IGL', 'SUPPORT'],
    bio: 'IGL + support — calls the fight and keeps the pack stacked with utility and structure.',
  },
  {
    id: 'p4',
    name: 'ANIKET',
    ign: 'SES-ANIKET17',
    role: 'Player',
    inGameRoles: ['SECONDARY_RUSHER'],
    bio: 'Secondary rusher — trades first contact and holds space after the entry.',
  },
  {
    id: 'p5',
    name: 'BOOM',
    ign: 'IE-BOOM',
    role: 'Player',
    inGameRoles: ['PRIMARY_RUSHER'],
    bio: 'Primary rusher — first man in, opens space, and forces the trade line.',
  },
];

const ROLE_LABELS: Record<string, string> = {
  IGL: 'IGL',
  SUPPORT: 'Support',
  PRIMARY_RUSHER: 'Primary rusher',
  SECONDARY_RUSHER: 'Secondary rusher',
  SNIPER: 'Sniper',
  'Owner Cum Mentor': 'Owner Cum Mentor',
};

export function formatInGameRole(role: string) {
  return ROLE_LABELS[role] ?? role;
}
