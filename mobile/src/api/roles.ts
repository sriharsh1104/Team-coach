// Mirrors backend/src/users/dto/update-profile.dto.ts ROLE_OPTIONS — keep in sync.
export const ROLE_OPTIONS = [
  'IGL',
  'PRIMARY_RUSHER',
  'SECONDARY_RUSHER',
  'GRENADIER_SUPPORT',
  'SNIPER',
] as const;

export type RoleOption = (typeof ROLE_OPTIONS)[number];

export const ROLE_LABELS: Record<RoleOption, string> = {
  IGL: 'IGL',
  PRIMARY_RUSHER: 'Primary rusher',
  SECONDARY_RUSHER: 'Secondary rusher',
  GRENADIER_SUPPORT: 'Grenadier/support',
  SNIPER: 'Sniper',
};

/** Label for any stored role string (incl. legacy values still in the DB). */
export function roleLabel(role: string): string {
  return (ROLE_LABELS as Record<string, string>)[role] ?? role;
}
