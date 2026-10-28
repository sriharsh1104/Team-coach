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
import {
  connectSocket,
  connectAndExpectRejection,
  connectViaQueryTokenAndExpectRejection,
  emitAck,
  waitForEvent,
  assertNoEvent,
} from './utils/socket-helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Phase 1D — Chat (e2e)', () => {
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
    for (const socket of openSockets) socket.disconnect();
    openSockets.length = 0;
    await resetDatabase(prisma);
  });

  async function setUpOrgWithPlayer() {
    const coach = await signup(server, { name: 'Coach' });
    const org = await createOrgAs(server, coach.accessToken, 'COACH');
    const player = await signup(server, { name: 'Player' });
    await joinOrgAs(server, player.accessToken, org.orgCode);
    return { coach, org, player };
  }

  describe('GET /chat/messages respects the org\'s historyVisibleToNewMembers setting', () => {
    it('hides messages from before a member joined once the owner turns history off, and restores them when turned back on', async () => {
      const coach = await signup(server, { name: 'Coach' });
      const org = await createOrgAs(server, coach.accessToken, 'COACH');

      const beforeMessage = await prisma.chatMessage.create({
        data: {
          orgId: org.id,
          channelKey: 'org',
          senderId: coach.user.id,
          text: 'before you joined',
        },
      });

      await request(server)
        .patch('/orgs/settings')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .send({ historyVisibleToNewMembers: false })
        .expect(200);

      const player = await signup(server, { name: 'Player' });
      await joinOrgAs(server, player.accessToken, org.orgCode);

      const afterMessage = await prisma.chatMessage.create({
        data: {
          orgId: org.id,
          channelKey: 'org',
          senderId: coach.user.id,
          text: 'after you joined',
        },
      });

      const restricted = await request(server)
        .get('/chat/messages')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .expect(200);
      const restrictedIds = restricted.body.map((m: any) => m.id);
      expect(restrictedIds).not.toContain(beforeMessage.id);
      expect(restrictedIds).toContain(afterMessage.id);

      // The coach (who was there from the start) always sees everything —
      // the cutoff is relative to each member's own join date.
      const coachView = await request(server)
        .get('/chat/messages')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(200);
      const coachIds = coachView.body.map((m: any) => m.id);
      expect(coachIds).toContain(beforeMessage.id);
      expect(coachIds).toContain(afterMessage.id);

      await request(server)
        .patch('/orgs/settings')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .send({ historyVisibleToNewMembers: true })
        .expect(200);

      const restored = await request(server)
        .get('/chat/messages')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .expect(200);
      const restoredIds = restored.body.map((m: any) => m.id);
      expect(restoredIds).toContain(beforeMessage.id);
      expect(restoredIds).toContain(afterMessage.id);
    });

    it('never restricts a DM channel, even when the org setting is off', async () => {
      const { coach, player } = await setUpOrgWithPlayer();
      const org = await request(server)
        .get('/orgs/me')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(200);
      await request(server)
        .patch('/orgs/settings')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .send({ historyVisibleToNewMembers: false })
        .expect(200);

      const dmChannelKey = [coach.user.id, player.user.id].sort().join(':');
      const message = await prisma.chatMessage.create({
        data: {
          orgId: org.body.id,
          channelKey: `dm:${dmChannelKey}`,
          senderId: coach.user.id,
          text: 'old dm message',
          createdAt: new Date(Date.now() - 60 * 60 * 1000),
        },
      });

      const res = await request(server)
        .get('/chat/messages')
        .query({ channelKey: `dm:${dmChannelKey}` })
        .set('Authorization', `Bearer ${player.accessToken}`)
        .expect(200);
      expect(res.body.map((m: any) => m.id)).toContain(message.id);
    });
  });

  describe('POST /chat/media (mirrors into the Media feed)', () => {
    it('uploading an image in chat also creates a Media feed entry, reachable via GET /media', async () => {
      const { coach } = await setUpOrgWithPlayer();

      const upload = await request(server)
        .post('/chat/media')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .attach('file', TINY_JPEG, { filename: 'shot.jpg', contentType: 'image/jpeg' })
        .expect(201);
      expect(upload.body.mediaUrl).toContain('/chat/files/');

      // Fire-and-forget on the server side — give it a tick to land.
      await new Promise((resolve) => setTimeout(resolve, 100));

      const media = await request(server)
        .get('/media')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(200);
      expect(media.body).toHaveLength(1);
      expect(media.body[0]).toMatchObject({ type: 'IMAGE', uploaderName: 'Coach' });
      expect(media.body[0].url).toContain('/media/files/');
    });
  });

  describe('GET /chat/messages', () => {
    it('requires authentication', async () => {
      await request(server).get('/chat/messages').expect(401);
    });

    it('404s for a user not in any org', async () => {
      const outsider = await signup(server);
      await request(server)
        .get('/chat/messages')
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .expect(404);
    });

    it('returns an empty list before anyone has said anything', async () => {
      const { player } = await setUpOrgWithPlayer();
      const res = await request(server)
        .get('/chat/messages')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it("includes the sender's current role and owner status on each message", async () => {
      const { coach, player } = await setUpOrgWithPlayer();
      const coachSocket = await connectSocket(baseUrl, coach.accessToken);
      openSockets.push(coachSocket);
      const received = waitForEvent(coachSocket, 'message:new');

      const playerSocket = await connectSocket(baseUrl, player.accessToken);
      openSockets.push(playerSocket);
      playerSocket.emit('message:send', { text: 'hi team' });
      await received;

      const res = await request(server)
        .get('/chat/messages')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].senderRole).toBe('PLAYER');
      // The coach is the org creator in setUpOrgWithPlayer, not this sender.
      expect(res.body[0].senderIsOwner).toBe(false);
    });
  });

  // Regression coverage for a real incident: an unapplied migration left
  // ChatMessage.channelKey / ChatReadState missing from the database, which
  // made this endpoint throw — silently swallowed on the mobile side into a
  // permanently-empty "No teammates yet." inbox despite the org having
  // multiple members. This is the endpoint ChatHubScreen's inbox is built on.
  describe('GET /chat/channels', () => {
    it('requires authentication', async () => {
      await request(server).get('/chat/channels').expect(401);
    });

    it('404s for a user not in any org', async () => {
      const outsider = await signup(server);
      await request(server)
        .get('/chat/channels')
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .expect(404);
    });

    it('always includes the org channel, and lists every other member as a DM-able teammate', async () => {
      const { coach, player } = await setUpOrgWithPlayer();

      const res = await request(server)
        .get('/chat/channels')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(200);

      expect(res.body.channels).toHaveLength(1);
      expect(res.body.channels[0]).toMatchObject({ channelKey: 'org', type: 'ORG' });
      expect(res.body.teammates).toHaveLength(1);
      expect(res.body.teammates[0].userId).toBe(player.user.id);
      expect(res.body.teammates[0].channelKey).toMatch(/^dm:/);
      expect(res.body.totalUnread).toBe(0);
    });

    it('surfaces an active DM channel once it has a message, with an unread count for the recipient', async () => {
      const { coach, player } = await setUpOrgWithPlayer();
      const coachSocket = await connectSocket(baseUrl, coach.accessToken);
      const playerSocket = await connectSocket(baseUrl, player.accessToken);
      openSockets.push(coachSocket, playerSocket);

      const dmChannelKey = (
        await request(server)
          .get('/chat/channels')
          .set('Authorization', `Bearer ${coach.accessToken}`)
          .expect(200)
      ).body.teammates[0].channelKey;

      await emitAck(coachSocket, 'channel:join', { channelKey: dmChannelKey });
      await emitAck(playerSocket, 'channel:join', { channelKey: dmChannelKey });
      const received = waitForEvent(playerSocket, 'message:new');
      coachSocket.emit('message:send', { channelKey: dmChannelKey, text: 'hey, got a sec?' });
      await received;

      const res = await request(server)
        .get('/chat/channels')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .expect(200);
      const dmEntry = res.body.channels.find((c: any) => c.channelKey === dmChannelKey);
      expect(dmEntry).toBeDefined();
      expect(dmEntry.unreadCount).toBe(1);
      expect(dmEntry.lastPreview).toBe('hey, got a sec?');
      expect(res.body.totalUnread).toBe(1);
    });
  });

  describe('WebSocket connection', () => {
    it('accepts a connection with a valid token', async () => {
      const { player } = await setUpOrgWithPlayer();
      const socket = await connectSocket(baseUrl, player.accessToken);
      openSockets.push(socket);
      expect(socket.connected).toBe(true);
    });

    it('rejects a connection with a garbage token', async () => {
      await connectAndExpectRejection(baseUrl, 'not-a-real-jwt');
    });

    it('rejects a connection with no token at all', async () => {
      await connectAndExpectRejection(baseUrl, '');
    });

    it('SECURITY: rejects a token sent only as a query-string param, even a valid one', async () => {
      const { player } = await setUpOrgWithPlayer();
      await connectViaQueryTokenAndExpectRejection(baseUrl, player.accessToken);
    });
  });

  describe('message:send / message:new', () => {
    it('broadcasts a message to everyone in the org, including the sender, and persists it', async () => {
      const { coach, player } = await setUpOrgWithPlayer();
      const coachSocket = await connectSocket(baseUrl, coach.accessToken);
      const playerSocket = await connectSocket(baseUrl, player.accessToken);
      openSockets.push(coachSocket, playerSocket);

      const coachReceived = waitForEvent(coachSocket, 'message:new');
      const senderReceived = waitForEvent(playerSocket, 'message:new');

      playerSocket.emit('message:send', { text: 'Ready for scrim at 8pm?' });

      const [fromCoach, fromSender] = await Promise.all([coachReceived, senderReceived]);
      expect(fromCoach.text).toBe('Ready for scrim at 8pm?');
      expect(fromCoach.senderName).toBe('Player');
      expect(fromSender.id).toBe(fromCoach.id);

      const history = await request(server)
        .get('/chat/messages')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(200);
      expect(history.body).toHaveLength(1);
      expect(history.body[0].text).toBe('Ready for scrim at 8pm?');
    });

    it('SECURITY: never delivers a message to a socket in a different org', async () => {
      const { player: playerA } = await setUpOrgWithPlayer();
      const { player: playerB } = await setUpOrgWithPlayer();

      const socketA = await connectSocket(baseUrl, playerA.accessToken);
      const socketB = await connectSocket(baseUrl, playerB.accessToken);
      openSockets.push(socketA, socketB);

      const bShouldNotHear = assertNoEvent(socketB, 'message:new');
      socketA.emit('message:send', { text: 'This is an org A secret' });
      await bShouldNotHear;

      const orgBHistory = await request(server)
        .get('/chat/messages')
        .set('Authorization', `Bearer ${playerB.accessToken}`)
        .expect(200);
      expect(orgBHistory.body).toHaveLength(0);
    });

    it('silently ignores an empty message (not persisted, no broadcast)', async () => {
      const { coach, player } = await setUpOrgWithPlayer();
      const coachSocket = await connectSocket(baseUrl, coach.accessToken);
      const playerSocket = await connectSocket(baseUrl, player.accessToken);
      openSockets.push(coachSocket, playerSocket);

      const noEvent = assertNoEvent(coachSocket, 'message:new');
      playerSocket.emit('message:send', { text: '   ' });
      await noEvent;

      const history = await request(server)
        .get('/chat/messages')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(200);
      expect(history.body).toHaveLength(0);
    });

    it('silently ignores a message over the 2000-character limit', async () => {
      const { coach, player } = await setUpOrgWithPlayer();
      const coachSocket = await connectSocket(baseUrl, coach.accessToken);
      const playerSocket = await connectSocket(baseUrl, player.accessToken);
      openSockets.push(coachSocket, playerSocket);

      const noEvent = assertNoEvent(coachSocket, 'message:new');
      playerSocket.emit('message:send', { text: 'x'.repeat(2001) });
      await noEvent;

      const history = await request(server)
        .get('/chat/messages')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(200);
      expect(history.body).toHaveLength(0);
    });
  });

  describe('GET /chat/read-receipts', () => {
    it('requires authentication', async () => {
      await request(server).get('/chat/read-receipts').expect(401);
    });

    it('404s for a user not in any org', async () => {
      const outsider = await signup(server);
      await request(server)
        .get('/chat/read-receipts')
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .expect(404);
    });

    it('is empty before anyone has marked the channel read', async () => {
      const { coach } = await setUpOrgWithPlayer();
      const res = await request(server)
        .get('/chat/read-receipts')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it('lists teammates who have read the channel, excluding the requester themselves', async () => {
      const { coach, player } = await setUpOrgWithPlayer();
      await request(server)
        .post('/chat/read')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .send({})
        .expect(201);

      const res = await request(server)
        .get('/chat/read-receipts')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ userId: player.user.id, name: 'Player' });
      expect(res.body[0].lastReadAt).toEqual(expect.any(String));

      // The requester's own read-state is never included in their own list.
      const playerView = await request(server)
        .get('/chat/read-receipts')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .expect(200);
      expect(playerView.body).toEqual([]);
    });

    it("SECURITY: never leaks a different org's read state", async () => {
      const { coach: coachA, player: playerA } = await setUpOrgWithPlayer();
      await request(server)
        .post('/chat/read')
        .set('Authorization', `Bearer ${playerA.accessToken}`)
        .send({})
        .expect(201);

      const { coach: coachB } = await setUpOrgWithPlayer();
      const res = await request(server)
        .get('/chat/read-receipts')
        .set('Authorization', `Bearer ${coachB.accessToken}`)
        .expect(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /chat/delivery-receipts', () => {
    it('requires authentication', async () => {
      await request(server).get('/chat/delivery-receipts').expect(401);
    });

    it('404s for a user not in any org', async () => {
      const outsider = await signup(server);
      await request(server)
        .get('/chat/delivery-receipts')
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .expect(404);
    });

    it('is empty before anyone has had the channel delivered to them', async () => {
      const { coach } = await setUpOrgWithPlayer();
      const res = await request(server)
        .get('/chat/delivery-receipts')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it("SECURITY: never leaks a different org's delivery state", async () => {
      const { player: playerA } = await setUpOrgWithPlayer();
      const socketA = await connectSocket(baseUrl, playerA.accessToken);
      openSockets.push(socketA);
      socketA.emit('channel:delivered', {});
      await new Promise((resolve) => setTimeout(resolve, 50));

      const { coach: coachB } = await setUpOrgWithPlayer();
      const res = await request(server)
        .get('/chat/delivery-receipts')
        .set('Authorization', `Bearer ${coachB.accessToken}`)
        .expect(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('channel:delivered socket event (double grey tick)', () => {
    it('persists the delivery-state and broadcasts chat:delivered to everyone else in the channel', async () => {
      const { coach, player } = await setUpOrgWithPlayer();
      const coachSocket = await connectSocket(baseUrl, coach.accessToken);
      const playerSocket = await connectSocket(baseUrl, player.accessToken);
      openSockets.push(coachSocket, playerSocket);

      const coachSawDelivered = waitForEvent(coachSocket, 'chat:delivered');
      playerSocket.emit('channel:delivered', {});
      const event = await coachSawDelivered;

      expect(event.userId).toBe(player.user.id);
      expect(event.userName).toBe('Player');
      expect(event.channelKey).toBe('org');
      expect(event.lastDeliveredAt).toBeTruthy();

      const receipts = await request(server)
        .get('/chat/delivery-receipts')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(200);
      expect(receipts.body).toHaveLength(1);
      expect(receipts.body[0].userId).toBe(player.user.id);
    });

    it("SECURITY: never broadcasts a chat:delivered event to a socket in a different org", async () => {
      const { player: playerA } = await setUpOrgWithPlayer();
      const { player: playerB } = await setUpOrgWithPlayer();
      const socketA = await connectSocket(baseUrl, playerA.accessToken);
      const socketB = await connectSocket(baseUrl, playerB.accessToken);
      openSockets.push(socketA, socketB);

      const bShouldNotHear = assertNoEvent(socketB, 'chat:delivered');
      socketA.emit('channel:delivered', {});
      await bShouldNotHear;
    });
  });

  describe('channel:read socket event ("Seen" live broadcast)', () => {
    it('persists the read-state and broadcasts chat:read to everyone else in the channel', async () => {
      const { coach, player } = await setUpOrgWithPlayer();
      const coachSocket = await connectSocket(baseUrl, coach.accessToken);
      const playerSocket = await connectSocket(baseUrl, player.accessToken);
      openSockets.push(coachSocket, playerSocket);

      const coachSawRead = waitForEvent(coachSocket, 'chat:read');
      playerSocket.emit('channel:read', {});
      const event = await coachSawRead;

      expect(event.userId).toBe(player.user.id);
      expect(event.userName).toBe('Player');
      expect(event.channelKey).toBe('org');
      expect(event.lastReadAt).toBeTruthy();

      const receipts = await request(server)
        .get('/chat/read-receipts')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(200);
      expect(receipts.body).toHaveLength(1);
      expect(receipts.body[0].userId).toBe(player.user.id);
    });

    it("SECURITY: never broadcasts a chat:read event to a socket in a different org", async () => {
      const { player: playerA } = await setUpOrgWithPlayer();
      const { player: playerB } = await setUpOrgWithPlayer();
      const socketA = await connectSocket(baseUrl, playerA.accessToken);
      const socketB = await connectSocket(baseUrl, playerB.accessToken);
      openSockets.push(socketA, socketB);

      const bShouldNotHear = assertNoEvent(socketB, 'chat:read');
      socketA.emit('channel:read', {});
      await bShouldNotHear;
    });
  });
});
