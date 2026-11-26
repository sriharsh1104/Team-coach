/**
 * Supported titles for UserGameProfile.roles / role chips.
 * Keep in sync with mobile/src/api/games.ts.
 */

export const GAME_IDS = [
  'FREE_FIRE',
  'BGMI',
  'MOBILE_LEGENDS',
  'LOL',
] as const;

export type GameId = (typeof GAME_IDS)[number];

export const GAME_LABELS: Record<GameId, string> = {
  FREE_FIRE: 'Free Fire',
  BGMI: 'BGMI',
  MOBILE_LEGENDS: 'Mobile Legends',
  LOL: 'League of Legends',
};

/** Free Fire roles — same list as UpdateProfileDto.ROLE_OPTIONS. */
export const FREE_FIRE_ROLES = [
  'IGL',
  'PRIMARY_RUSHER',
  'SECONDARY_RUSHER',
  'GRENADIER_SUPPORT',
  'SNIPER',
] as const;

export const GAME_ROLE_OPTIONS: Record<GameId, readonly string[]> = {
  FREE_FIRE: FREE_FIRE_ROLES,
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

export function isGameId(value: string): value is GameId {
  return (GAME_IDS as readonly string[]).includes(value);
}

export function isRoleForGame(game: GameId, role: string | null | undefined) {
  if (!role) return true;
  return (GAME_ROLE_OPTIONS[game] as readonly string[]).includes(role);
}

/** UID is digits-only for the battle-royale / MLBB IDs; LoL uses Riot ID text. */
export function uidLooksValid(game: GameId, uid: string) {
  if (!uid) return true;
  if (game === 'LOL') return uid.length <= 50;
  return /^\d+$/.test(uid);
}
