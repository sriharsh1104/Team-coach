export type TeamPlayer = {
  id: string;
  name: string;
  ign: string;
  role: string;
  inGameRoles: string[];
  bio: string;
};

/** Public roster cards — replace with real Sacred players anytime. */
export const TEAM_PLAYERS: TeamPlayer[] = [
  {
    id: 'p1',
    name: 'Sri',
    ign: 'SES-SRI',
    role: 'Coach / Owner',
    inGameRoles: ['IGL'],
    bio: 'Calls rotations, keeps discipline tight, builds the 5-match practice block.',
  },
  {
    id: 'p2',
    name: 'Ash',
    ign: 'SES-ASH',
    role: 'Player',
    inGameRoles: ['PRIMARY_RUSHER'],
    bio: 'Entry pressure and first contact — trades clean when the IGL commits.',
  },
  {
    id: 'p3',
    name: 'Rex',
    ign: 'SES-REX',
    role: 'Player',
    inGameRoles: ['SECONDARY_RUSHER'],
    bio: 'Second man in the pack — covers trades and holds space after the knock.',
  },
  {
    id: 'p4',
    name: 'Nova',
    ign: 'SES-NOVA',
    role: 'Player',
    inGameRoles: ['SNIPER'],
    bio: 'Long-range info and picks — anchors compounds in mid-to-late zone.',
  },
  {
    id: 'p5',
    name: 'Kai',
    ign: 'SES-KAI',
    role: 'Player',
    inGameRoles: ['GRENADIER_SUPPORT'],
    bio: 'Utility, heals, and soft utility timing so the pack can take space.',
  },
];

const ROLE_LABELS: Record<string, string> = {
  IGL: 'IGL',
  PRIMARY_RUSHER: 'Primary rusher',
  SECONDARY_RUSHER: 'Secondary rusher',
  GRENADIER_SUPPORT: 'Grenadier / support',
  SNIPER: 'Sniper',
};

export function formatInGameRole(role: string) {
  return ROLE_LABELS[role] ?? role;
}
