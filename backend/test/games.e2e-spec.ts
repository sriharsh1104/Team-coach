import { INestApplication } from '@nestjs/common';
import { Socket } from 'socket.io-client';
import {
  createTestApp,
  getPrisma,
  resetDatabase,
  listenOnEphemeralPort,
} from './utils/test-app';
import { signup, createOrgAs, joinOrgAs } from './utils/fixtures';
import { connectSocket, emitAck, waitForEvent } from './utils/socket-helpers';
import { PrismaService } from '../src/prisma/prisma.service';

type Ack = { ok: boolean; room?: any; error?: string };


function waitForRoomUpdate(socket: Socket, pred: (u: any) => boolean, timeoutMs = 4000): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      socket.off('room:update', handler);
      reject(new Error('room:update matching predicate not received'));
    }, timeoutMs);
    const handler = (u: any) => {
      if (!pred(u)) return;
      clearTimeout(t);
      socket.off('room:update', handler);
      resolve(u);
    };
    socket.on('room:update', handler);
  });
}

describe('Games (/games namespace) (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let baseUrl: string;
  let prisma: PrismaService;
  const openSockets: Socket[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    baseUrl = await listenOnEphemeralPort(app);
    prisma = getPrisma(app);
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  afterEach(async () => {
    for (const s of openSockets) s.disconnect();
    openSockets.length = 0;
    await resetDatabase(prisma);
  });

  async function setUp(playerCount = 2) {
    const coach = await signup(server, { name: 'Coach' });
    const org = await createOrgAs(server, coach.accessToken, 'COACH');
    const players = [coach];
    for (let i = 1; i < playerCount; i++) {
      const p = await signup(server, { name: `Player${i}` });
      await joinOrgAs(server, p.accessToken, org.rosterCode);
      players.push(p);
    }
    const sockets: Socket[] = [];
    for (const p of players) {
      const s = await connectSocket(baseUrl, p.accessToken, '/games');
      openSockets.push(s);
      sockets.push(s);
    }
    return { players, sockets };
  }

  it('rejects a garbage token', async () => {
    const { connectAndExpectRejection } = await import('./utils/socket-helpers');
    await connectAndExpectRejection(baseUrl, 'nope', '/games');
  });

  it('SECURITY: garbage maxPlayers (object/non-numeric) does not make the room infinitely joinable', async () => {
    const { sockets } = await setUp(4);
    const [host, p1, p2, p3] = sockets;
    // A buggy or malicious client could send anything here — must clamp to
    // the game's real max (2 for rps here), never NaN.
    const created = await emitAck<Ack>(host, 'room:create', { game: 'rps', maxPlayers: {} });
    expect(created).toMatchObject({ ok: true });
    expect(created.room.maxPlayers).toBe(2);

    const joined = await emitAck<Ack>(p1, 'room:join', { roomId: created.room.id });
    expect(joined).toMatchObject({ ok: true });
    expect(joined.room.players).toHaveLength(2);

    const overfull = await emitAck<Ack>(p2, 'room:join', { roomId: created.room.id });
    expect(overfull.ok).toBe(false);
    expect(overfull.error).toMatch(/full/i);

    const alsoOverfull = await emitAck<Ack>(p3, 'room:join', { roomId: created.room.id });
    expect(alsoOverfull.ok).toBe(false);
  });

  it('RPS: create → teammate sees it in the lobby → join → start → a full round with hidden picks and a reveal', async () => {
    const { players, sockets } = await setUp(2);
    const [host, guest] = sockets;
    const [hostUser, guestUser] = players;

    const lobbyChanged = waitForEvent(guest, 'rooms:changed');
    const created = await emitAck<Ack>(host, 'room:create', { game: 'rps' });
    expect(created).toMatchObject({ ok: true });
    expect(created.room.status).toBe('lobby');
    expect(created.room.players).toHaveLength(1);
    await lobbyChanged;

    const list = await emitAck<Ack>(guest, 'room:list');
    expect(list).toMatchObject({ ok: true });
    expect(list.room).toHaveLength(1);
    expect(list.room[0].id).toBe(created.room.id);

    const hostSeesJoin = waitForRoomUpdate(host, (u) => u.room.players.length === 2);
    const joined = await emitAck<Ack>(guest, 'room:join', { roomId: created.room.id });
    expect(joined).toMatchObject({ ok: true });
    expect(joined.room.players.map((p: any) => p.name)).toEqual(['Coach', 'Player1']);
    expect((await hostSeesJoin).room.players).toHaveLength(2);

    // Only the host can start.
    const notHost = await emitAck<Ack>(guest, 'room:start', { roomId: created.room.id });
    expect(notHost.ok).toBe(false);

    const started = await emitAck<Ack>(host, 'room:start', { roomId: created.room.id });
    expect(started).toMatchObject({ ok: true });
    expect(started.room.status).toBe('playing');
    expect(started.room.rps.round).toBe(1);
    expect(started.room.rps.phase).toBe('picking');

    // Host picks: guest sees "picked" but never the choice.
    const guestSeesPick = waitForRoomUpdate(guest, (u) => u.room.rps?.picked?.[hostUser.user.id] === true);
    const picked = await emitAck<Ack>(host, 'rps:pick', { choice: 'paper' });
    expect(picked).toMatchObject({ ok: true });
    const upd = await guestSeesPick;
    expect(upd.room.rps.picked[hostUser.user.id]).toBe(true);
    expect(JSON.stringify(upd.room.rps)).not.toContain('paper');

    const reveal = waitForRoomUpdate(host, (u) => u.event?.type === 'rps:reveal');
    const second = await emitAck<Ack>(guest, 'rps:pick', { choice: 'stone' });
    expect(second).toMatchObject({ ok: true });
    const rev = await reveal;
    expect(rev.event.type).toBe('rps:reveal');
    expect(rev.room.rps.lastResult.winnerId).toBe(hostUser.user.id);
    expect(rev.room.rps.scores[hostUser.user.id]).toBe(1);
    expect(rev.room.rps.scores[guestUser.user.id]).toBe(0);
    expect(rev.room.rps.lastResult.picks[guestUser.user.id]).toBe('stone');

    const bad = await emitAck<Ack>(guest, 'rps:pick', { choice: 'lizard' });
    expect(bad.ok).toBe(false);
  });

  it('Ludo: 3 players start, colours assigned, only the current player may roll, and leaving removes the seat', async () => {
    const { players, sockets } = await setUp(3);
    const [host, p1, p2] = sockets;
    const created = await emitAck<Ack>(host, 'room:create', { game: 'ludo', maxPlayers: 4 });
    await emitAck<Ack>(p1, 'room:join', { roomId: created.room.id });
    await emitAck<Ack>(p2, 'room:join', { roomId: created.room.id });
    const started = await emitAck<Ack>(host, 'room:start', { roomId: created.room.id });
    expect(started).toMatchObject({ ok: true });
    expect(started.room.ludo.turnOrder).toEqual(players.map((p) => p.user.id));
    expect(Object.values(started.room.ludo.colors)).toEqual(['red', 'green', 'yellow']);
    expect(started.room).toMatchObject({ deadline: expect.any(Number) });
    expect(started.room.deadline).toBeGreaterThan(Date.now());

    const wrongTurn = await emitAck<Ack>(p1, 'ludo:roll', {});
    expect(wrongTurn.ok).toBe(false);
    expect(wrongTurn.error).toMatch(/Not your turn/);

    const rolled = await emitAck<Ack>(host, 'ludo:roll', {});
    expect(rolled).toMatchObject({ ok: true });
    // All 4 tokens start in base — only a roll of 6 lets one leave. Any
    // other roll correctly passes the turn immediately and clears `dice`
    // (see advanceTurn() in ludo.engine.ts), so both outcomes are valid;
    // asserting dice is always 1-6 here was flaky (~83% chance of failing).
    if (rolled.room.ludo.dice !== null) {
      expect(rolled.room.ludo.dice).toBeGreaterThanOrEqual(1);
      expect(rolled.room.ludo.dice).toBeLessThanOrEqual(6);
      expect(rolled.room.ludo.phase).toBe('move');
    } else {
      expect(rolled.room.ludo.phase).toBe('roll');
      expect(rolled.room.ludo.turnIndex).not.toBe(0); // turn passed on
    }

    const othersSee = waitForRoomUpdate(p2, (u) => u.room.players.length === 2);
    const left = await emitAck<Ack>(p1, 'room:leave');
    expect(left).toMatchObject({ ok: true });
    const after = await othersSee;
    expect(after.room.players).toHaveLength(2);
    expect(after.room.ludo.turnOrder).toHaveLength(2);
  });

  it('invite reaches the teammate live; inviting someone outside the org is refused', async () => {
    const { players, sockets } = await setUp(2);
    const [host, guest] = sockets;
    await emitAck<Ack>(host, 'room:create', { game: 'rps' });
    const invited = waitForEvent<any>(guest, 'room:invite');
    const ok = await emitAck<Ack>(host, 'room:invite', { userId: players[1].user.id });
    expect(ok).toMatchObject({ ok: true });
    const inv = await invited;
    expect(inv.from.name).toBe('Coach');
    expect(inv.room.game).toBe('rps');

    const outsider = await signup(server, { name: 'Outsider' });
    const refused = await emitAck<Ack>(host, 'room:invite', { userId: outsider.user.id });
    expect(refused.ok).toBe(false);
  });
  it('notify cooldown: same teammate only once per 5 min per room; a new game is allowed; notify-all skips cooled-down users', async () => {
    const { players, sockets } = await setUp(3);
    const [host] = sockets;
    const created = await emitAck<Ack>(host, 'room:create', { game: 'ludo' });
    expect(created.ok).toBe(true);

    const members = await emitAck<Ack>(host, 'room:members');
    expect(members.ok).toBe(true);
    expect((members.room as any[]).map((m) => m.userId).sort()).toEqual(
      [players[1].user.id, players[2].user.id].sort(),
    );

    const first = await emitAck<Ack>(host, 'room:invite', { userId: players[1].user.id });
    expect(first).toMatchObject({ ok: true });
    const again = await emitAck<Ack>(host, 'room:invite', { userId: players[1].user.id });
    expect(again.ok).toBe(false);
    expect(again.error).toMatch(/already notified/i);

    const all = await emitAck<Ack>(host, 'room:invite-all', {});
    expect(all).toMatchObject({ ok: true });
    expect(all.room.sentIds).toEqual([players[2].user.id]);
    expect(all.room.skippedIds).toEqual([players[1].user.id]);

    // Different room / game → cooldown does not apply.
    await emitAck<Ack>(host, 'room:leave', {});
    const other = await emitAck<Ack>(host, 'room:create', { game: 'rps' });
    expect(other.ok).toBe(true);
    const crossGame = await emitAck<Ack>(host, 'room:invite', { userId: players[1].user.id });
    expect(crossGame).toMatchObject({ ok: true });
  });
});
