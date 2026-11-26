import { apiClient } from './client';
import { GameKind } from './games';

/**
 * Leaderboard + per-player stats for the seven in-app mini-games
 * (backend/src/games/games-stats.service.ts). Deliberately its own file and
 * its own type names — `api/stats.ts` already owns `LeaderboardRow` /
 * `PlayerStatsResponse` for the esports BR scoreboard, a different feature
 * entirely with the same obvious names.
 */

export type GameLeaderboardRow = {
  rank: number;
  userId: string;
  name: string;
  avatarUrl: string | null;
  played: number;
  wins: number;
  losses: number;
  /** 0–1 — format as a percentage for display. */
  winRate: number;
};

/**
 * The backend's Prisma enum, over the wire as its own UPPERCASE spelling
 * ('CHESS', 'RACE', …) — distinct from `GameKind`, the lowercase id
 * (`api/games.ts`) everything else in the app (room creation, GAME_CATALOG)
 * uses. `game.toLowerCase()` is how a response value maps back to a
 * GameKind for looking a catalog entry up.
 */
export type MiniGameKind = 'RPS' | 'LUDO' | 'BOOTS' | 'CUT' | 'CHESS' | 'UNO' | 'RACE';

export type GameBreakdownRow = {
  game: MiniGameKind;
  played: number;
  wins: number;
  losses: number;
  winRate: number;
};

export type GameRecentMatch = {
  id: string;
  game: MiniGameKind;
  playedAt: string;
  won: boolean;
  /** No winner at all (a draw/stalemate) — distinct from a loss. */
  draw: boolean;
  endReason: string | null;
  opponents: { userId: string; name: string }[];
};

export type GamePlayerStats = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  totals: { played: number; wins: number; losses: number; winRate: number };
  byGame: GameBreakdownRow[];
  recent: GameRecentMatch[];
};

/** Org-wide, ranked by wins then games played. Omit `game` for the combined board. */
export function getGameLeaderboard(game?: GameKind) {
  return apiClient
    .get<GameLeaderboardRow[]>('/games/leaderboard', {
      params: game ? { game } : {},
    })
    .then((res) => res.data);
}

export function getMyGameStats() {
  return apiClient.get<GamePlayerStats>('/games/stats').then((res) => res.data);
}

/** Any teammate's stats — the same roster everyone can already see. */
export function getPlayerGameStats(userId: string) {
  return apiClient
    .get<GamePlayerStats>(`/games/stats/${userId}`)
    .then((res) => res.data);
}
