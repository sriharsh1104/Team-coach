import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MiniGameKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from '../chat/chat.service';

/** One row of the leaderboard, already ranked. */
export type LeaderboardRow = {
  rank: number;
  userId: string;
  name: string;
  avatarUrl: string | null;
  played: number;
  wins: number;
  losses: number;
  /** 0–1, rounded to three decimals — the client formats it as a percentage. */
  winRate: number;
};

export type GameBreakdown = {
  game: MiniGameKind;
  played: number;
  wins: number;
  losses: number;
  winRate: number;
};

export type RecentMatch = {
  id: string;
  game: MiniGameKind;
  playedAt: string;
  won: boolean;
  /** True when the match had no winner at all (a draw/stalemate), not just a loss. */
  draw: boolean;
  endReason: string | null;
  opponents: { userId: string; name: string }[];
};

export type PlayerStatsView = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  totals: { played: number; wins: number; losses: number; winRate: number };
  byGame: GameBreakdown[];
  recent: RecentMatch[];
};

function winRate(wins: number, played: number): number {
  if (played === 0) return 0;
  return Math.round((wins / played) * 1000) / 1000;
}

/** Road Rash is retired — keep historical rows in DB but out of boards/stats. */
const HIDDEN_STATS_GAMES: MiniGameKind[] = [MiniGameKind.RACE];

/**
 * Leaderboard and per-player stats for the seven in-app mini-games
 * (GamesService writes one GameMatch + GameMatchPlayer row per finished
 * match — see GamesService.persistMatch). Entirely read-only: nothing here
 * touches a live room.
 */
@Injectable()
export class GamesStatsService {
  constructor(
    private readonly prisma: PrismaService,
    // Not MembershipService: a guild-only member (GuildMembership, no
    // roster Membership row) plays and shows up in match history exactly
    // like a roster player — getChatContext is the one place that already
    // resolves orgId from either, the same resolution the Games gateway
    // itself uses to scope a room's orgId in the first place.
    private readonly chat: ChatService,
  ) {}

  /**
   * Org-wide leaderboard, ranked by wins then games played. `game` narrows
   * it to one game's record instead of the combined total across all seven.
   *
   * Two grouped counts rather than one: Prisma's `groupBy` can `_sum` a
   * number but not the `won` boolean, so "games played" and "wins" are two
   * queries (both indexed on `[orgId, game, userId]` / `[orgId, userId, won]`)
   * merged in memory, rather than one query with a boolean sum that Prisma
   * cannot express.
   */
  async leaderboard(
    userId: string,
    game?: MiniGameKind,
  ): Promise<LeaderboardRow[]> {
    const { orgId } = await this.chat.getChatContext(userId);
    if (game && HIDDEN_STATS_GAMES.includes(game)) return [];
    const where = {
      orgId,
      ...(game
        ? { game }
        : { game: { notIn: HIDDEN_STATS_GAMES } }),
    };

    const [played, wins] = await Promise.all([
      this.prisma.gameMatchPlayer.groupBy({
        by: ['userId'],
        where,
        _count: { _all: true },
      }),
      this.prisma.gameMatchPlayer.groupBy({
        by: ['userId'],
        where: { ...where, won: true },
        _count: { _all: true },
      }),
    ]);
    if (played.length === 0) return [];

    const winsByUser = new Map(wins.map((w) => [w.userId, w._count._all]));
    const users = await this.prisma.user.findMany({
      where: { id: { in: played.map((p) => p.userId) } },
      select: { id: true, name: true, avatarUrl: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    return played
      .map((row) => {
        const w = winsByUser.get(row.userId) ?? 0;
        const p = row._count._all;
        const user = userById.get(row.userId);
        return {
          userId: row.userId,
          // A member who has since left the org can still have history —
          // the roster-check fix means a forfeit always gets recorded, and
          // that can outlive the person's membership. Name them plainly
          // rather than dropping their row from the board entirely.
          name: user?.name ?? 'Former member',
          avatarUrl: user?.avatarUrl ?? null,
          played: p,
          wins: w,
          losses: p - w,
          winRate: winRate(w, p),
        };
      })
      .sort((a, b) => b.wins - a.wins || b.played - a.played)
      .map((row, i) => ({ rank: i + 1, ...row }));
  }

  /**
   * One member's stats: overall totals, a breakdown per game, and their
   * last ten matches. Defaults to the caller; `targetUserId` looks up anyone
   * else in the same org (the roster itself is already visible to every
   * member, so their win/loss record is no more private than that).
   */
  async playerStats(
    userId: string,
    targetUserId?: string,
  ): Promise<PlayerStatsView> {
    const { orgId } = await this.chat.getChatContext(userId);
    const target = targetUserId ?? userId;

    const user = await this.prisma.user.findUnique({
      where: { id: target },
      select: { id: true, name: true, avatarUrl: true },
    });
    if (!user) throw new NotFoundException('Player not found');
    if (target !== userId) {
      // Same roster-or-guild check as the caller's own org resolution: a
      // guild-only target is just as visible as a roster one.
      const [targetRoster, targetGuild] = await Promise.all([
        this.prisma.membership.findFirst({ where: { userId: target, orgId } }),
        this.prisma.guildMembership.findFirst({
          where: { userId: target, orgId },
        }),
      ]);
      if (!targetRoster && !targetGuild) {
        throw new NotFoundException('That player is not in your org');
      }
    }

    const where = {
      orgId,
      userId: target,
      game: { notIn: HIDDEN_STATS_GAMES },
    };
    const [playedByGame, winsByGame, recentMatches] = await Promise.all([
      this.prisma.gameMatchPlayer.groupBy({
        by: ['game'],
        where,
        _count: { _all: true },
      }),
      this.prisma.gameMatchPlayer.groupBy({
        by: ['game'],
        where: { ...where, won: true },
        _count: { _all: true },
      }),
      this.prisma.gameMatch.findMany({
        where: {
          orgId,
          game: { notIn: HIDDEN_STATS_GAMES },
          players: { some: { userId: target } },
        },
        orderBy: { playedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          game: true,
          winnerId: true,
          endReason: true,
          playedAt: true,
          players: {
            select: {
              userId: true,
              user: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    const winsOf = new Map(winsByGame.map((w) => [w.game, w._count._all]));
    const byGame: GameBreakdown[] = playedByGame
      .map((row) => {
        const w = winsOf.get(row.game) ?? 0;
        const p = row._count._all;
        return {
          game: row.game,
          played: p,
          wins: w,
          losses: p - w,
          winRate: winRate(w, p),
        };
      })
      .sort((a, b) => b.played - a.played);

    const totalPlayed = byGame.reduce((sum, g) => sum + g.played, 0);
    const totalWins = byGame.reduce((sum, g) => sum + g.wins, 0);

    const recent: RecentMatch[] = recentMatches.map((m) => ({
      id: m.id,
      game: m.game,
      playedAt: m.playedAt.toISOString(),
      won: m.winnerId === target,
      draw: m.winnerId === null,
      endReason: m.endReason,
      opponents: m.players
        .filter((p) => p.userId !== target)
        .map((p) => ({
          userId: p.userId,
          name: p.user?.name ?? 'Former member',
        })),
    }));

    return {
      userId: user.id,
      name: user.name,
      avatarUrl: user.avatarUrl,
      totals: {
        played: totalPlayed,
        wins: totalWins,
        losses: totalPlayed - totalWins,
        winRate: winRate(totalWins, totalPlayed),
      },
      byGame,
      recent,
    };
  }
}

/** Validates the `?game=` query param against the enum, or rejects it. */
export function parseMiniGameKind(
  raw: string | undefined,
): MiniGameKind | undefined {
  if (raw === undefined) return undefined;
  const upper = raw.toUpperCase();
  if (!(Object.values(MiniGameKind) as string[]).includes(upper)) {
    throw new BadRequestException(
      `Unknown game "${raw}" — expected one of ${Object.values(MiniGameKind).join(', ')}`,
    );
  }
  return upper as MiniGameKind;
}
