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
    games.setListeners((room, _event, targetUserId) => {
      if (room.chess) seen.push({ target: targetUserId, yourColor: room.chess.yourColor });
    }, () => {});

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

  it('Uno rooms accept 2–6 seats and hide opponent hands per viewer', () => {
    const room = games.createRoom('org', p('a'), 'uno', 4);
    expect(room.maxPlayers).toBe(4);
    expect(room.game).toBe('uno');
    games.joinRoom(room.id, 'org', p('b'));
    games.joinRoom(room.id, 'org', p('c'));
    games.startGame(room.id, 'a');

    const forA = games.roomOf('a');
    const forB = games.roomOf('b');
    expect(forA?.uno?.hand).toHaveLength(7);
    expect(forB?.uno?.hand).toHaveLength(7);
    expect(forA?.uno?.handCounts.b).toBe(7);
    // A's hand cards must not leak into B's view.
    const aIds = new Set((forA?.uno?.hand ?? []).map((c) => c.id));
    expect((forB?.uno?.hand ?? []).some((c) => aIds.has(c.id))).toBe(false);

    const topId = forA!.uno!.top!.id;
    const playable = forA!.uno!.playableIds[0];
    if (playable) {
      games.unoPlay(room.id, 'a', playable);
      expect(games.roomOf('b')?.uno?.top?.id).not.toBe(topId);
    }
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
    games.setListeners((_room, _event, targetUserId) => {
      if (targetUserId) seen.push(targetUserId);
    }, () => {});

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
    expect(games.spectateRoom(chess.id, 'org', p('c')).spectators).toHaveLength(1);

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

    const uno = games.createRoom('org', p('d'), 'uno');
    games.joinRoom(uno.id, 'org', p('e'));
    games.startGame(uno.id, 'd');
    expect(() => games.spectateRoom(uno.id, 'org', p('f'))).toThrow(
      /cannot be watched/,
    );
  });
});
