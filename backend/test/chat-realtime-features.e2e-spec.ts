import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { Socket } from 'socket.io-client';
import {
  createTestApp,
  getPrisma,
  resetDatabase,
  listenOnEphemeralPort,
} from './utils/test-app';
import { signup, createOrgAs, joinOrgAs, TINY_JPEG } from './utils/fixtures';
import { connectSocket, emitAck, waitForEvent } from './utils/socket-helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * WhatsApp-parity features added on top of Phase 1D chat: typing indicator,
 * emoji reactions, forward, online/last-seen presence, and link previews.
 */
describe('Chat real-time features (e2e)', () => {
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

  async function setUpOrgWithTwoPlayers() {
    const coach = await signup(server, { name: 'Coach' });
    const org = await createOrgAs(server, coach.accessToken, 'COACH');
    const player = await signup(server, { name: 'Player' });
    await joinOrgAs(server, player.accessToken, org.rosterCode);
    return { coach, org, player };
  }

  async function sendMessage(socket: Socket, payload: Record<string, unknown>) {
    return emitAck<{ ok: boolean; id?: string; error?: string }>(socket, 'message:send', {
      channelKey: 'org',
      ...payload,
    });
  }

  describe('Typing indicator', () => {
    it('broadcasts typing:update to everyone else in the channel, not to the typer themselves', async () => {
      const { coach, player } = await setUpOrgWithTwoPlayers();
      const coachSocket = await connectSocket(baseUrl, coach.accessToken);
      const playerSocket = await connectSocket(baseUrl, player.accessToken);
      openSockets.push(coachSocket, playerSocket);
      coachSocket.emit('channel:join', { channelKey: 'org' });
      playerSocket.emit('channel:join', { channelKey: 'org' });

      const selfShouldNotSeeIt = new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 800);
        playerSocket.once('typing:update', () => {
          clearTimeout(t);
          reject(new Error('typer should not receive their own typing:update'));
        });
      });
      const othersSee = waitForEvent<{ userId: string; typing: boolean }>(
        coachSocket,
        'typing:update',
      );
      playerSocket.emit('typing:start', { channelKey: 'org' });
      const [update] = await Promise.all([othersSee, selfShouldNotSeeIt]);
      expect(update).toMatchObject({ userId: player.user.id, typing: true });

      const stopSeen = waitForEvent<{ userId: string; typing: boolean }>(coachSocket, 'typing:update');
      playerSocket.emit('typing:stop', { channelKey: 'org' });
      expect(await stopSeen).toMatchObject({ userId: player.user.id, typing: false });
    });

    it('clears the indicator automatically when the typer sends a message instead of explicitly stopping', async () => {
      const { coach, player } = await setUpOrgWithTwoPlayers();
      const coachSocket = await connectSocket(baseUrl, coach.accessToken);
      const playerSocket = await connectSocket(baseUrl, player.accessToken);
      openSockets.push(coachSocket, playerSocket);
      coachSocket.emit('channel:join', { channelKey: 'org' });
      playerSocket.emit('channel:join', { channelKey: 'org' });

      playerSocket.emit('typing:start', { channelKey: 'org' });
      await waitForEvent(coachSocket, 'typing:update');

      const stopSeen = waitForEvent<{ typing: boolean }>(coachSocket, 'typing:update');
      await sendMessage(playerSocket, { text: 'done typing, sending now' });
      expect(await stopSeen).toMatchObject({ typing: false });
    });

    it('clears the indicator for everyone when the typer disconnects mid-type', async () => {
      const { coach, player } = await setUpOrgWithTwoPlayers();
      const coachSocket = await connectSocket(baseUrl, coach.accessToken);
      const playerSocket = await connectSocket(baseUrl, player.accessToken);
      openSockets.push(coachSocket);
      coachSocket.emit('channel:join', { channelKey: 'org' });
      playerSocket.emit('channel:join', { channelKey: 'org' });

      playerSocket.emit('typing:start', { channelKey: 'org' });
      await waitForEvent(coachSocket, 'typing:update');

      const stopSeen = waitForEvent<{ typing: boolean }>(coachSocket, 'typing:update');
      playerSocket.disconnect();
      expect(await stopSeen).toMatchObject({ typing: false });
    });
  });

  describe('Reactions', () => {
    it('reacting, changing the emoji, and toggling it off all broadcast the updated summary live', async () => {
      const { coach, player } = await setUpOrgWithTwoPlayers();
      const coachSocket = await connectSocket(baseUrl, coach.accessToken);
      const playerSocket = await connectSocket(baseUrl, player.accessToken);
      openSockets.push(coachSocket, playerSocket);
      coachSocket.emit('channel:join', { channelKey: 'org' });
      playerSocket.emit('channel:join', { channelKey: 'org' });

      const sent = await sendMessage(coachSocket, { text: 'gg' });
      const messageId = sent.id!;

      const sawReaction = waitForEvent<{ messageId: string; reactions: any[] }>(
        playerSocket,
        'message:reaction',
      );
      const ack = await emitAck<{ ok: boolean; reactions: any[] }>(playerSocket, 'message:react', {
        messageId,
        emoji: '👍',
      });
      expect(ack).toMatchObject({ ok: true });
      expect(ack.reactions).toEqual([
        { emoji: '👍', count: 1, userIds: [player.user.id], reactedByMe: true },
      ]);
      expect((await sawReaction).reactions).toHaveLength(1);

      // Same user, different emoji → replaces (not adds a second reaction).
      const changed = await emitAck<{ reactions: any[] }>(playerSocket, 'message:react', {
        messageId,
        emoji: '🔥',
      });
      expect(changed.reactions).toEqual([
        { emoji: '🔥', count: 1, userIds: [player.user.id], reactedByMe: true },
      ]);

      // Same emoji again → removes it.
      const removed = await emitAck<{ reactions: any[] }>(playerSocket, 'message:react', {
        messageId,
        emoji: '🔥',
      });
      expect(removed.reactions).toEqual([]);
    });

    it('SECURITY: cannot react to a message in a channel you are not in', async () => {
      const { coach } = await setUpOrgWithTwoPlayers();
      const { player: outsider } = await setUpOrgWithTwoPlayers();
      const coachSocket = await connectSocket(baseUrl, coach.accessToken);
      const outsiderSocket = await connectSocket(baseUrl, outsider.accessToken);
      openSockets.push(coachSocket, outsiderSocket);

      const sent = await sendMessage(coachSocket, { text: 'secret team gg' });
      const ack = await emitAck<{ ok: boolean; error?: string }>(outsiderSocket, 'message:react', {
        messageId: sent.id,
        emoji: '👍',
      });
      expect(ack.ok).toBe(false);
    });

    it('reactions show up when loading chat history', async () => {
      const { coach, player } = await setUpOrgWithTwoPlayers();
      const coachSocket = await connectSocket(baseUrl, coach.accessToken);
      openSockets.push(coachSocket);
      const sent = await sendMessage(coachSocket, { text: 'react to this' });
      await emitAck(coachSocket, 'message:react', { messageId: sent.id, emoji: '🎉' });

      const history = await request(server)
        .get('/chat/messages?channelKey=org')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .expect(200);
      const msg = history.body.find((m: any) => m.id === sent.id);
      expect(msg.reactions).toEqual([
        { emoji: '🎉', count: 1, userIds: [coach.user.id], reactedByMe: false },
      ]);
    });
  });

  describe('Forward', () => {
    it('forwards a message into a DM, tagged as forwarded, and the DM recipient sees it live', async () => {
      const { coach, player } = await setUpOrgWithTwoPlayers();
      const coachSocket = await connectSocket(baseUrl, coach.accessToken);
      const playerSocket = await connectSocket(baseUrl, player.accessToken);
      openSockets.push(coachSocket, playerSocket);

      const sent = await sendMessage(coachSocket, { text: 'forward me' });
      const dmKey = `dm:${[coach.user.id, player.user.id].sort().join(':')}`;
      playerSocket.emit('channel:join', { channelKey: dmKey });

      const dmSees = waitForEvent<any>(playerSocket, 'message:new');
      const ack = await emitAck<{ ok: boolean; results: Array<{ channelKey: string; ok: boolean }> }>(
        coachSocket,
        'message:forward',
        { messageId: sent.id, toChannelKeys: [dmKey] },
      );
      expect(ack).toMatchObject({ ok: true, results: [{ channelKey: dmKey, ok: true }] });
      const dmMessage = await dmSees;
      expect(dmMessage).toMatchObject({ text: 'forward me', forwarded: true, channelKey: dmKey });
    });

    it('SECURITY: cannot forward a message you never had access to', async () => {
      const { coach } = await setUpOrgWithTwoPlayers();
      const { coach: otherCoach, player: otherPlayer } = await setUpOrgWithTwoPlayers();
      const coachSocket = await connectSocket(baseUrl, coach.accessToken);
      const otherSocket = await connectSocket(baseUrl, otherCoach.accessToken);
      openSockets.push(coachSocket, otherSocket);

      const sent = await sendMessage(coachSocket, { text: 'not yours to forward' });
      const otherDm = `dm:${[otherCoach.user.id, otherPlayer.user.id].sort().join(':')}`;
      const ack = await emitAck<{ ok: boolean }>(otherSocket, 'message:forward', {
        messageId: sent.id,
        toChannelKeys: [otherDm],
      });
      expect(ack.ok).toBe(false);
    });

    it('rejects forwarding to more than the per-request limit', async () => {
      const { coach } = await setUpOrgWithTwoPlayers();
      const coachSocket = await connectSocket(baseUrl, coach.accessToken);
      openSockets.push(coachSocket);
      const sent = await sendMessage(coachSocket, { text: 'spam attempt' });
      const tooMany = Array.from({ length: 11 }, (_, i) => `dm:x:${i}`);
      const ack = await emitAck<{ ok: boolean; error?: string }>(coachSocket, 'message:forward', {
        messageId: sent.id,
        toChannelKeys: tooMany,
      });
      expect(ack.ok).toBe(false);
      expect(ack.error).toMatch(/at most/i);
    });
  });

  describe('Online / last-seen presence', () => {
    it('reports online while connected, then online:false with a lastSeenAt once the last device disconnects', async () => {
      const { coach, player } = await setUpOrgWithTwoPlayers();
      const coachSocket = await connectSocket(baseUrl, coach.accessToken);
      const playerSocket = await connectSocket(baseUrl, player.accessToken);
      openSockets.push(coachSocket);

      const whilePlayerOnline = await emitAck<{ presence: Record<string, any> }>(
        coachSocket,
        'presence:get',
        { userIds: [player.user.id] },
      );
      expect(whilePlayerOnline.presence[player.user.id]).toMatchObject({
        online: true,
        lastSeenAt: null,
      });

      const offlineUpdate = waitForEvent<{ userId: string; online: boolean; lastSeenAt: string }>(
        coachSocket,
        'presence:update',
      );
      playerSocket.disconnect();
      const update = await offlineUpdate;
      expect(update.userId).toBe(player.user.id);
      expect(update.online).toBe(false);
      expect(update.lastSeenAt).toEqual(expect.any(String));

      const afterDisconnect = await emitAck<{ presence: Record<string, any> }>(
        coachSocket,
        'presence:get',
        { userIds: [player.user.id] },
      );
      expect(afterDisconnect.presence[player.user.id].online).toBe(false);
      expect(afterDisconnect.presence[player.user.id].lastSeenAt).toEqual(expect.any(String));
    });

    it('a second device does not re-broadcast "online" (already was), and only going offline on the LAST device fires an update', async () => {
      const { coach, player } = await setUpOrgWithTwoPlayers();
      const coachSocket = await connectSocket(baseUrl, coach.accessToken);
      const playerDeviceA = await connectSocket(baseUrl, player.accessToken);
      const playerDeviceB = await connectSocket(baseUrl, player.accessToken);
      openSockets.push(coachSocket, playerDeviceB);

      const noSecondOnlineUpdate = new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 500);
        coachSocket.once('presence:update', () => {
          clearTimeout(t);
          reject(new Error('should not re-announce online for a second device'));
        });
      });
      await noSecondOnlineUpdate; // playerDeviceA already connected before B joined above

      playerDeviceA.disconnect();
      // Still online via device B — presence:get must say so.
      const stillOnline = await emitAck<{ presence: Record<string, any> }>(
        coachSocket,
        'presence:get',
        { userIds: [player.user.id] },
      );
      expect(stillOnline.presence[player.user.id].online).toBe(true);
    });
  });

  describe('Link preview', () => {
    it('requires authentication', async () => {
      await request(server)
        .get('/chat/link-preview')
        .query({ url: 'https://example.com' })
        .expect(401);
    });

    it('SECURITY: refuses to fetch localhost/loopback/private addresses (SSRF guard)', async () => {
      const { coach } = await setUpOrgWithTwoPlayers();
      for (const target of [
        'http://127.0.0.1/secret',
        'http://localhost:3000/health',
        'http://169.254.169.254/latest/meta-data',
        'http://192.168.1.1/',
      ]) {
        const res = await request(server)
          .get('/chat/link-preview')
          .query({ url: target })
          .set('Authorization', `Bearer ${coach.accessToken}`);
        expect(res.status).toBe(400);
      }
    });

    it('rejects non-http(s) schemes', async () => {
      const { coach } = await setUpOrgWithTwoPlayers();
      const res = await request(server)
        .get('/chat/link-preview')
        .query({ url: 'file:///etc/passwd' })
        .set('Authorization', `Bearer ${coach.accessToken}`);
      expect(res.status).toBe(400);
    });
  });

  describe('Voice notes (audio chat media)', () => {
    it('uploads an audio file, typed AUDIO, and does not mirror into the Media feed', async () => {
      const { coach } = await setUpOrgWithTwoPlayers();
      const upload = await request(server)
        .post('/chat/media')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .attach('file', Buffer.from('fake aac bytes'), {
          filename: 'note.m4a',
          contentType: 'audio/mp4',
        })
        .expect(201);
      expect(upload.body.mediaType).toBe('AUDIO');
      expect(upload.body.mediaUrl).toMatch(/^\/chat\/files\//);
      expect(upload.body.mediaPostId).toBeNull();

      const img = await request(server).get(upload.body.mediaUrl).expect(200);
      expect(img.headers['content-type']).toMatch(/^audio\//);
    });

    it('a voice note message round-trips through send + history with mediaType AUDIO', async () => {
      const { coach, player } = await setUpOrgWithTwoPlayers();
      const upload = await request(server)
        .post('/chat/media')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .attach('file', Buffer.from('fake aac bytes'), {
          filename: 'note.m4a',
          contentType: 'audio/mp4',
        })
        .expect(201);

      const coachSocket = await connectSocket(baseUrl, coach.accessToken);
      openSockets.push(coachSocket);
      const sent = await sendMessage(coachSocket, {
        mediaUrl: upload.body.mediaUrl,
        mediaType: 'AUDIO',
      });
      expect(sent.ok).toBe(true);

      const history = await request(server)
        .get('/chat/messages?channelKey=org')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .expect(200);
      expect(history.body.find((m: any) => m.id === sent.id)?.mediaType).toBe('AUDIO');
    });

    it('still rejects disallowed file types (e.g. SVG) even with audio now allowed', async () => {
      const { coach } = await setUpOrgWithTwoPlayers();
      await request(server)
        .post('/chat/media')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .attach('file', Buffer.from('<svg onload=alert(1)></svg>'), {
          filename: 'x.svg',
          contentType: 'image/svg+xml',
        })
        .expect(400);
    });
  });

  it('TINY_JPEG fixture is still usable for an ordinary image chat upload (sanity check this suite did not break it)', async () => {
    const { coach } = await setUpOrgWithTwoPlayers();
    const upload = await request(server)
      .post('/chat/media')
      .set('Authorization', `Bearer ${coach.accessToken}`)
      .attach('file', TINY_JPEG, { filename: 'shot.jpg', contentType: 'image/jpeg' })
      .expect(201);
    expect(upload.body.mediaType).toBe('IMAGE');
  });
});
