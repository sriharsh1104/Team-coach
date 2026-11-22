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
});
