import { NotFoundException } from '@nestjs/common';
import { GamesStatsService, parseMiniGameKind } from './games-stats.service';

/**
 * Query shape itself is verified by hand against the real local Postgres
 * (this repo's *.spec.ts files are pure-mock unit tests, same as everywhere
 * else here — see test/jest-e2e.json for the real-database suite). What
 * belongs here is the arithmetic and the access rules: merging the two
 * grouped counts into wins/losses/winRate, ranking, the draw/opponent shape
 * of a recent match, and who may look up whose stats.
 */
describe('GamesStatsService', () => {
  const chat = { getChatContext: jest.fn() };
  const prisma = {
    gameMatchPlayer: { groupBy: jest.fn() },
    gameMatch: { findMany: jest.fn() },
    user: { findMany: jest.fn(), findUnique: jest.fn() },
    membership: { findFirst: jest.fn() },
    guildMembership: { findFirst: jest.fn() },
  };
  let service: GamesStatsService;

  beforeEach(() => {
    jest.clearAllMocks();
    chat.getChatContext.mockResolvedValue({ orgId: 'org-1', roster: true });
    prisma.guildMembership.findFirst.mockResolvedValue(null);
    service = new GamesStatsService(prisma as any, chat as any);
  });

  describe('leaderboard', () => {
    it('ranks by wins then games played, and fills in losses and win rate', async () => {
      prisma.gameMatchPlayer.groupBy
        .mockResolvedValueOnce([
          { userId: 'a', _count: { _all: 5 } },
          { userId: 'b', _count: { _all: 4 } },
          // c has played more than b but won nothing — still ranked below a
          // tied-or-better win count, never just by games played.
          { userId: 'c', _count: { _all: 6 } },
        ])
        .mockResolvedValueOnce([
          { userId: 'a', _count: { _all: 3 } },
          { userId: 'b', _count: { _all: 3 } },
        ]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'a', name: 'Alice', avatarUrl: null },
        { id: 'b', name: 'Bob', avatarUrl: 'bob.png' },
        { id: 'c', name: 'Carol', avatarUrl: null },
      ]);

      const board = await service.leaderboard('me');

      expect(board.map((r) => r.userId)).toEqual(['a', 'b', 'c']);
      expect(board[0]).toMatchObject({
        rank: 1,
        userId: 'a',
        played: 5,
        wins: 3,
        losses: 2,
        winRate: 0.6,
      });
      // b and a tie on wins (3), so games played breaks the tie — more
      // played for the same wins ranks lower, not higher.
      expect(board[1]).toMatchObject({ rank: 2, userId: 'b', winRate: 0.75 });
      expect(board[2]).toMatchObject({
        rank: 3,
        userId: 'c',
        wins: 0,
        winRate: 0,
      });
    });

    it('scopes the query to the caller’s own org, and to one game when asked', async () => {
      prisma.gameMatchPlayer.groupBy.mockResolvedValue([]);
      await service.leaderboard('me', 'CHESS' as any);
      expect(prisma.gameMatchPlayer.groupBy).toHaveBeenNthCalledWith(1, {
        by: ['userId'],
        where: { orgId: 'org-1', game: 'CHESS' },
        _count: { _all: true },
      });
      expect(prisma.gameMatchPlayer.groupBy).toHaveBeenNthCalledWith(2, {
        by: ['userId'],
        where: { orgId: 'org-1', game: 'CHESS', won: true },
        _count: { _all: true },
      });
    });

    it('names a player "Former member" rather than dropping their row, once their account is gone', async () => {
      prisma.gameMatchPlayer.groupBy
        .mockResolvedValueOnce([{ userId: 'gone', _count: { _all: 2 } }])
        .mockResolvedValueOnce([]);
      prisma.user.findMany.mockResolvedValue([]); // left the org / deleted
      const board = await service.leaderboard('me');
      expect(board[0]).toMatchObject({
        userId: 'gone',
        name: 'Former member',
        played: 2,
      });
    });

    it('returns an empty board rather than querying for names with nobody to look up', async () => {
      prisma.gameMatchPlayer.groupBy.mockResolvedValue([]);
      const board = await service.leaderboard('me');
      expect(board).toEqual([]);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });

  describe('playerStats', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'target',
        name: 'Target',
        avatarUrl: null,
      });
      prisma.gameMatch.findMany.mockResolvedValue([]);
    });

    it('defaults to the caller when no target is given', async () => {
      prisma.gameMatchPlayer.groupBy.mockResolvedValue([]);
      await service.playerStats('me');
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'me' },
        select: { id: true, name: true, avatarUrl: true },
      });
      // Looking up yourself never touches the org-membership guard.
      expect(prisma.membership.findFirst).not.toHaveBeenCalled();
      expect(prisma.guildMembership.findFirst).not.toHaveBeenCalled();
    });

    it('builds totals and a per-game breakdown from the two grouped counts', async () => {
      prisma.gameMatchPlayer.groupBy
        .mockResolvedValueOnce([
          { game: 'CHESS', _count: { _all: 4 } },
          { game: 'UNO', _count: { _all: 2 } },
        ])
        .mockResolvedValueOnce([{ game: 'CHESS', _count: { _all: 1 } }]);
      prisma.membership.findFirst.mockResolvedValue({
        userId: 'target',
        orgId: 'org-1',
      });

      const result = await service.playerStats('me', 'target');

      expect(result.totals).toEqual({
        played: 6,
        wins: 1,
        losses: 5,
        winRate: 0.167,
      });
      expect(result.byGame).toEqual([
        { game: 'CHESS', played: 4, wins: 1, losses: 3, winRate: 0.25 },
        { game: 'UNO', played: 2, wins: 0, losses: 2, winRate: 0 },
      ]);
    });

    it('marks a drawn match by its null winner, not as a loss', async () => {
      prisma.gameMatchPlayer.groupBy.mockResolvedValue([]);
      prisma.gameMatch.findMany.mockResolvedValue([
        {
          id: 'm1',
          game: 'CHESS',
          winnerId: null,
          endReason: 'stalemate',
          playedAt: new Date('2026-01-01T00:00:00Z'),
          players: [
            { userId: 'me', user: { id: 'me', name: 'Me' } },
            { userId: 'rival', user: { id: 'rival', name: 'Rival' } },
          ],
        },
      ]);
      const result = await service.playerStats('me');
      expect(result.recent[0]).toMatchObject({
        id: 'm1',
        won: false,
        draw: true,
        opponents: [{ userId: 'rival', name: 'Rival' }],
      });
    });

    it('lets you check a teammate on the roster', async () => {
      prisma.gameMatchPlayer.groupBy.mockResolvedValue([]);
      prisma.membership.findFirst.mockResolvedValue({
        userId: 'target',
        orgId: 'org-1',
      });
      const result = await service.playerStats('me', 'target');
      expect(prisma.membership.findFirst).toHaveBeenCalledWith({
        where: { userId: 'target', orgId: 'org-1' },
      });
      expect(result.userId).toBe('target');
    });

    it('lets you check a guild-only teammate too, who has no roster membership at all', async () => {
      prisma.gameMatchPlayer.groupBy.mockResolvedValue([]);
      prisma.membership.findFirst.mockResolvedValue(null);
      prisma.guildMembership.findFirst.mockResolvedValue({
        userId: 'target',
        orgId: 'org-1',
      });
      const result = await service.playerStats('me', 'target');
      expect(prisma.guildMembership.findFirst).toHaveBeenCalledWith({
        where: { userId: 'target', orgId: 'org-1' },
      });
      expect(result.userId).toBe('target');
    });

    it('refuses an account in neither the roster nor the guild', async () => {
      prisma.membership.findFirst.mockResolvedValue(null);
      prisma.guildMembership.findFirst.mockResolvedValue(null);
      await expect(service.playerStats('me', 'target')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses a user id that does not exist at all', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.playerStats('me', 'ghost')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('parseMiniGameKind', () => {
    it('passes a valid game through, case-insensitively', () => {
      expect(parseMiniGameKind('chess')).toBe('CHESS');
      expect(parseMiniGameKind('RACE')).toBe('RACE');
    });

    it('leaves the leaderboard combined across all games when nothing is asked for', () => {
      expect(parseMiniGameKind(undefined)).toBeUndefined();
    });

    it('rejects anything that is not one of the seven games', () => {
      expect(() => parseMiniGameKind('poker')).toThrow(/Unknown game/);
    });
  });
});
