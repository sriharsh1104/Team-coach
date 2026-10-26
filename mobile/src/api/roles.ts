// Mirrors backend/src/users/dto/update-profile.dto.ts ROLE_OPTIONS — keep in sync.
export const ROLE_OPTIONS = [
  'IGL',
  'ENTRY_FRAGGER',
  'SUPPORT',
  'SNIPER',
  'FLANKER',
  'LURKER',
  'RIFLER',
  'GRENADIER',
] as const;

export type RoleOption = (typeof ROLE_OPTIONS)[number];

export const ROLE_LABELS: Record<RoleOption, string> = {
  IGL: 'IGL',
  ENTRY_FRAGGER: 'Entry Fragger',
  SUPPORT: 'Support',
  SNIPER: 'Sniper',
  FLANKER: 'Flanker',
  LURKER: 'Lurker',
  RIFLER: 'Rifler',
  GRENADIER: 'Grenadier',
};
