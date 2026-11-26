/**
 * Multi-game profile catalog — keep in sync with
 * backend/src/users/game-profiles.ts.
 *
 * Separate from api/games.ts (mini-games / socket catalog).
 */

export const PROFILE_GAME_IDS = [
  'FREE_FIRE',
  'BGMI',
  'MOBILE_LEGENDS',
  'LOL',
] as const;

export type ProfileGameId = (typeof PROFILE_GAME_IDS)[number];

/** @deprecated Use ProfileGameId — kept for call sites typed as GameId. */
export type GameId = ProfileGameId;

export const GAME_OPTIONS: Array<{ id: ProfileGameId; label: string }> = [
  { id: 'FREE_FIRE', label: 'Free Fire' },
  { id: 'BGMI', label: 'BGMI' },
  { id: 'MOBILE_LEGENDS', label: 'Mobile Legends' },
  { id: 'LOL', label: 'League of Legends' },
];

export const GAME_LABELS: Record<ProfileGameId, string> = {
  FREE_FIRE: 'Free Fire',
  BGMI: 'BGMI',
  MOBILE_LEGENDS: 'Mobile Legends',
  LOL: 'League of Legends',
};

export const GAME_ROLE_OPTIONS: Record<ProfileGameId, readonly string[]> = {
  FREE_FIRE: [
    'IGL',
    'PRIMARY_RUSHER',
    'SECONDARY_RUSHER',
    'GRENADIER_SUPPORT',
    'SNIPER',
  ],
  BGMI: ['IGL', 'ASSAULTER', 'SUPPORT', 'SNIPER', 'ENTRY'],
  MOBILE_LEGENDS: [
    'TANK',
    'FIGHTER',
    'ASSASSIN',
    'MAGE',
    'MARKSMAN',
    'SUPPORT',
  ],
  LOL: ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'],
};

export const GAME_ROLE_LABELS: Record<string, string> = {
  IGL: 'IGL',
  PRIMARY_RUSHER: 'Primary Rusher',
  SECONDARY_RUSHER: 'Secondary Rusher',
  GRENADIER_SUPPORT: 'Grenadier / Support',
  SNIPER: 'Sniper',
  ASSAULTER: 'Assaulter',
  SUPPORT: 'Support',
  ENTRY: 'Entry',
  TANK: 'Tank',
  FIGHTER: 'Fighter',
  ASSASSIN: 'Assassin',
  MAGE: 'Mage',
  MARKSMAN: 'Marksman',
  TOP: 'Top',
  JUNGLE: 'Jungle',
  MID: 'Mid',
  ADC: 'ADC',
};

export function gameRoleLabel(role: string): string {
  return GAME_ROLE_LABELS[role] ?? role.replace(/_/g, ' ');
}

export function gameLabel(game: string): string {
  return (GAME_LABELS as Record<string, string>)[game] ?? game;
}

/** Numeric UID for BR / MLBB; LoL accepts Riot ID text. */
export function sanitizeGameUid(game: ProfileGameId, value: string): string {
  if (game === 'LOL') return value.slice(0, 50);
  return value.replace(/\D/g, '').slice(0, 50);
}
