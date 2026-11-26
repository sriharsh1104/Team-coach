import { GamesService } from './games.service';

const p = (id: string) => ({ userId: id, name: id, avatarUrl: null });

describe('GamesService — several rooms at once', () => {
  let games: GamesService;
  beforeEach(() => {
    games = new GamesService();
  });
  afterEach(() => {
    for (const id of ['a', 'b', 'c', 'd']) games.leaveRoom(id);
  });

  it('two pairs play separate Stone Paper Scissors matches in the same guild', () => {
    const r1 = games.createRoom('org', p('a'), 'rps');
    const r2 = games.createRoom('org', p('c'), 'rps');
    games.joinRoom(r1.id, 'org', p('b'));
    games.joinRoom(r2.id, 'org', p('d'));
    games.startGame(r1.id, 'a');
    games.startGame(r2.id, 'c');

    // Everyone sees both rooms in the lobby list / both are running.
    expect(
      games
        .listRooms('org')
        .map((r) => r.id)
        .sort(),
    ).toEqual([r1.id, r2.id].sort());

    // Room 1 plays a round; room 2 is untouched.
    games.rpsPick(r1.id, 'a', 'stone');
    games.rpsPick(r1.id, 'b', 'scissors');
    expect(games.roomViewById(r1.id)?.rps?.lastResult).toBeTruthy();
    expect(games.roomViewById(r2.id)?.rps?.lastResult ?? null).toBeNull();

    // Room 2's players can still pick independently.
    games.rpsPick(r2.id, 'c', 'paper');
    expect(() => games.rpsPick(r2.id, 'a', 'paper')).toThrow();
    expect(games.roomOf('a')?.id).toBe(r1.id);
    expect(games.roomOf('d')?.id).toBe(r2.id);
  });

  it('someone leaving one room does not affect the other room', () => {
    const r1 = games.createRoom('org', p('a'), 'rps');
    const r2 = games.createRoom('org', p('c'), 'rps');
    games.joinRoom(r1.id, 'org', p('b'));
    games.joinRoom(r2.id, 'org', p('d'));

    games.leaveRoom('a');
    expect(games.roomViewById(r1.id)?.players.map((x) => x.userId)).toEqual([
      'b',
    ]);
    expect(games.roomViewById(r2.id)?.players.map((x) => x.userId)).toEqual([
      'c',
      'd',
    ]);
  });

  it('rooms of another guild are never listed or joinable', () => {
    const r1 = games.createRoom('org1', p('a'), 'rps');
    games.createRoom('org2', p('c'), 'rps');
    expect(games.listRooms('org1')).toHaveLength(1);
    expect(() => games.joinRoom(r1.id, 'org2', p('d'))).toThrow(
      'Room not found',
    );
  });

  it('broadcasts a reaction without storing it, and rejects made-up ones', () => {
    const room = games.createRoom('org', p('a'), 'boots');
    games.joinRoom(room.id, 'org', p('b'));

    const view = games.react(room.id, 'a', 'laughing');
    // It is a moment, not state — nothing about it survives into the room.
    expect(JSON.stringify(view)).not.toContain('laughing');

    expect(() => games.react(room.id, 'a', 'rude-word')).toThrow(
      /Unknown reaction/,
    );
    expect(() => games.react(room.id, 'outsider', 'cool')).toThrow(
      /not in this room/,
    );
  });

  it('Chess seats exactly two, White first, and rejects an illegal move', () => {
    const room = games.createRoom('org', p('a'), 'chess');
    expect(room.maxPlayers).toBe(2);
    expect(room.minPlayers).toBe(2);
    games.joinRoom(room.id, 'org', p('b'));
    games.startGame(room.id, 'a');

    // The host takes White, so it is their move and only theirs.
    const forA = games.roomOf('a');
    const forB = games.roomOf('b');
    expect(forA?.chess?.yourColor).toBe('w');
    expect(forB?.chess?.yourColor).toBe('b');
    expect(forA?.chess?.legalMoves).toHaveLength(20);
    expect(forB?.chess?.legalMoves).toHaveLength(0);

    expect(() => games.chessMove(room.id, 'b', 'e7', 'e5')).toThrow(
      /Not your turn/,
    );
    // A knight cannot reach e5 from g1 — the engine is the only judge.
    expect(() => games.chessMove(room.id, 'a', 'g1', 'e5')).toThrow(
      /Illegal move/,
    );

    games.chessMove(room.id, 'a', 'e2', 'e4');
    expect(games.roomOf('b')?.chess?.turn).toBe('b');
    expect(games.roomOf('b')?.chess?.lastMove?.san).toBe('e4');
  });

  it('broadcasts each player their own view, not a shared one biased toward seat 0', () => {
    // Regression: `emit()` used to send ONE view (computed from seat 0 / White)
    // to every room/user channel for Chess — meaning Black's broadcast always
    // said `yourColor: 'w'`. `roomOf()` (a direct per-user fetch) never
    // exercised that path, so this only shows up by capturing what the
    // broadcast listener itself receives.
    const seen: { target?: string; yourColor: 'w' | 'b' | null }[] = [];
    games.setListeners(
      (room, _event, targetUserId) => {
        if (room.chess)
          seen.push({ target: targetUserId, yourColor: room.chess.yourColor });
      },
      () => {},
    );

    const room = games.createRoom('org', p('a'), 'chess');
    games.joinRoom(room.id, 'org', p('b'));
    seen.length = 0; // only care about the broadcast from here on
    games.startGame(room.id, 'a');

    const forA = seen.find((s) => s.target === 'a');
    const forB = seen.find((s) => s.target === 'b');
    expect(forA?.yourColor).toBe('w');
    expect(forB?.yourColor).toBe('b');
  });

  it('Chess hands the win to whoever is left when the other player leaves', () => {
    const room = games.createRoom('org', p('a'), 'chess');
    games.joinRoom(room.id, 'org', p('b'));
    games.startGame(room.id, 'a');

    games.leaveRoom('a');
    expect(games.roomOf('b')?.chess?.winnerId).toBe('b');
    expect(games.roomOf('b')?.chess?.endReason).toBe('forfeit');
  });

  it('Cut rooms seat 2–4 and show every board to everyone', () => {
    const room = games.createRoom('org', p('a'), 'cut', 4);
    expect(room.maxPlayers).toBe(4);
    expect(room.game).toBe('cut');
    games.joinRoom(room.id, 'org', p('b'));
    games.joinRoom(room.id, 'org', p('c'));
    games.startGame(room.id, 'a');

    const forA = games.roomOf('a');
    expect(forA?.cut?.turnId).toBe('a');
    // Nothing is hidden in Cut — every player's board is in every view.
    expect(Object.keys(forA?.cut?.cut ?? {}).sort()).toEqual(['a', 'b', 'c']);
    expect(forA?.cut?.cut.b).toEqual([]);

    // Only the player holding the card may draw.
    expect(() => games.cutDraw(room.id, 'b')).toThrow(/Not your turn/);
    games.cutDraw(room.id, 'a');
    const after = games.roomOf('b')?.cut;
    expect(after?.lastDraw).toBeGreaterThanOrEqual(1);
    expect(after?.lastDraw).toBeLessThanOrEqual(9);
    expect(after?.lastDrawBy).toBe('a');
    // A fresh number keeps the card; a repeat passes it on.
    expect(after?.turnId).toBe(after?.lastWasRepeat ? 'b' : 'a');
  });

  it('lets a non-player watch a live Chess match, with no yourColor and no moves', () => {
    const room = games.createRoom('org', p('a'), 'chess');
    games.joinRoom(room.id, 'org', p('b'));
    expect(() => games.spectateRoom(room.id, 'org', p('c'))).toThrow(
      /Nothing to watch yet/,
    );

    games.startGame(room.id, 'a');
    const asSpectator = games.spectateRoom(room.id, 'org', p('c'));
    expect(asSpectator.spectators.map((s) => s.userId)).toEqual(['c']);
    expect(asSpectator.chess?.yourColor).toBeNull();
    expect(asSpectator.chess?.board).toBeTruthy(); // board itself is public

    expect(() => games.chessMove(room.id, 'c', 'e2', 'e4')).toThrow(
      /not in this game/,
    );

    // Leaving a *player* seat never touches the spectator list.
    games.unspectateRoom('c');
    expect(games.roomViewById(room.id)?.spectators).toHaveLength(0);
  });

  it('broadcasts a spectator their own scoped view alongside the players', () => {
    const seen: string[] = [];
    games.setListeners(
      (_room, _event, targetUserId) => {
        if (targetUserId) seen.push(targetUserId);
      },
      () => {},
    );

    const room = games.createRoom('org', p('a'), 'chess');
    games.joinRoom(room.id, 'org', p('b'));
    games.startGame(room.id, 'a');
    games.spectateRoom(room.id, 'org', p('c'));

    seen.length = 0;
    games.chessMove(room.id, 'a', 'e2', 'e4');
    expect(new Set(seen)).toEqual(new Set(['a', 'b', 'c']));
  });

  it('blocks spectating while actively playing elsewhere, but not while idling in a lobby', () => {
    const chess = games.createRoom('org', p('a'), 'chess');
    games.joinRoom(chess.id, 'org', p('b'));
    games.startGame(chess.id, 'a');

    const otherLobby = games.createRoom('org', p('c'), 'rps');
    // c is just sitting in an unstarted lobby elsewhere — nothing to forfeit.
    expect(games.spectateRoom(chess.id, 'org', p('c')).spectators).toHaveLength(
      1,
    );

    const otherGame = games.createRoom('org', p('d'), 'rps');
    games.joinRoom(otherGame.id, 'org', p('e'));
    games.startGame(otherGame.id, 'd'); // d is now mid-match
    expect(() => games.spectateRoom(chess.id, 'org', p('d'))).toThrow(
      /Finish or leave your current game/,
    );
    expect(games.roomOf('d')?.id).toBe(otherGame.id); // untouched, not forfeited
  });

  it('refuses to spectate games with hidden information (Boots / Uno)', () => {
    const boots = games.createRoom('org', p('a'), 'boots');
    games.joinRoom(boots.id, 'org', p('b'));
    games.startGame(boots.id, 'a');
    expect(() => games.spectateRoom(boots.id, 'org', p('c'))).toThrow(
      /cannot be watched/,
    );
  });

  it('lets a non-player watch Cut, which hides nothing', () => {
    const room = games.createRoom('org', p('a'), 'cut');
    games.joinRoom(room.id, 'org', p('b'));
    games.startGame(room.id, 'a');
    const view = games.spectateRoom(room.id, 'org', p('c'));
    expect(view.spectators.map((s) => s.userId)).toEqual(['c']);
    expect(view.cut?.cut.a).toEqual([]);
    expect(() => games.cutDraw(room.id, 'c')).toThrow(/Not your turn/);
  });
});

describe('GamesService — Road Rash (retired)', () => {
  it('refuses to open a new race room', () => {
    const games = new GamesService();
    expect(() => games.createRoom('org', p('a'), 'race')).toThrow(
      /no longer available/,
    );
  });
});

/**
 * Match history (GameMatch / GameMatchPlayer) is written from GamesService
 * itself, fire-and-forget, so the live game is never held up by a database
 * round trip. These exercise that write directly against a mocked Prisma,
 * through the exact same public actions the socket gateway calls.
 */
describe('GamesService — match history persistence', () => {
  let prisma: { gameMatch: { create: jest.Mock } };
  let games: GamesService;

  beforeEach(() => {
    prisma = { gameMatch: { create: jest.fn().mockResolvedValue(undefined) } };
    games = new GamesService(prisma as any);
  });
  afterEach(() => {
    for (const id of ['a', 'b']) games.leaveRoom(id);
  });

  it('records a forfeited match as a loss for the player who left, using the roster the match actually started with', () => {
    const room = games.createRoom('org', p('a'), 'chess');
    games.joinRoom(room.id, 'org', p('b'));
    games.startGame(room.id, 'a');

    // Leaving splices 'b' out of room.players (and out of the chess
    // engine's own playerIds) before the match-history write happens —
    // this is the exact scenario matchPlayers exists to survive.
    games.leaveRoom('b');

    expect(prisma.gameMatch.create).toHaveBeenCalledTimes(1);
    const { data } = prisma.gameMatch.create.mock.calls[0][0];
    expect(data).toMatchObject({
      orgId: 'org',
      game: 'CHESS',
      winnerId: 'a',
      endReason: 'forfeit',
    });
    expect(data.players.create).toHaveLength(2);
    expect(data.players.create).toEqual(
      expect.arrayContaining([
        { userId: 'a', orgId: 'org', game: 'CHESS', won: true },
        { userId: 'b', orgId: 'org', game: 'CHESS', won: false },
      ]),
    );
  });

  it('does not record a second win when the remaining player also leaves after a forfeit', () => {
    const room = games.createRoom('org', p('a'), 'chess');
    games.joinRoom(room.id, 'org', p('b'));
    games.startGame(room.id, 'a');
    games.leaveRoom('b');
    expect(prisma.gameMatch.create).toHaveBeenCalledTimes(1);
    // Winner leaving the finished room (or a late second leave) must not
    // inflate the board with another GameMatch / win.
    games.leaveRoom('a');
    expect(prisma.gameMatch.create).toHaveBeenCalledTimes(1);
  });

  it('falls back to a generic end reason for a game with no end-reason concept of its own', () => {
    const room = games.createRoom('org', p('a'), 'cut');
    games.joinRoom(room.id, 'org', p('b'));
    games.startGame(room.id, 'a');

    // Cut's engine has no `endReason` field at all — drive it to 'done'
    // directly rather than fighting its own internal randomness.
    const live = (games as unknown as { rooms: Map<string, any> }).rooms.get(
      room.id,
    )!;
    live.cut.phase = 'done';
    live.cut.winnerId = 'b';
    (games as unknown as { finish: (room: unknown) => void }).finish(live);

    const { data } = prisma.gameMatch.create.mock.calls[0][0];
    expect(data).toMatchObject({
      game: 'CUT',
      winnerId: 'b',
      endReason: 'complete',
    });
    expect(data.players.create).toEqual(
      expect.arrayContaining([
        { userId: 'a', orgId: 'org', game: 'CUT', won: false },
        { userId: 'b', orgId: 'org', game: 'CUT', won: true },
      ]),
    );
  });

  it('never writes history for a room that never started a match', () => {
    const room = games.createRoom('org', p('a'), 'chess');
    games.joinRoom(room.id, 'org', p('b'));
    // Leaving the lobby (never started) must not touch GameMatch at all.
    games.leaveRoom('b');
    expect(prisma.gameMatch.create).not.toHaveBeenCalled();
  });

  it('skips persistence entirely when constructed with no Prisma — plain unit tests elsewhere in this file rely on exactly this', () => {
    const bare = new GamesService();
    const room = bare.createRoom('org', p('a'), 'chess');
    bare.joinRoom(room.id, 'org', p('b'));
    bare.startGame(room.id, 'a');
    expect(() => bare.leaveRoom('b')).not.toThrow();
  });
});
