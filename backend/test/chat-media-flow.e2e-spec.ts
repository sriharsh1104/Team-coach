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
 * The exact sequence the mobile app runs when you pick a photo in team chat:
 * POST /chat/media → socket message:send {mediaUrl, mediaType, clientId} →
 * message:new echo (with clientId, so the optimistic bubble gets swapped) →
 * the other member sees it live, in history, and can load the bytes.
 */
describe('Chat media send flow (e2e)', () => {
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

  async function setUpOrgWithPlayer() {
    const coach = await signup(server, { name: 'Coach' });
    const org = await createOrgAs(server, coach.accessToken, 'COACH');
    const player = await signup(server, { name: 'Player' });
    await joinOrgAs(server, player.accessToken, org.rosterCode);
    return { coach, org, player };
  }

  it('photo sent from one phone shows up live for the other, in history, and its bytes download for both', async () => {
    const { coach, player } = await setUpOrgWithPlayer();
    const coachSocket = await connectSocket(baseUrl, coach.accessToken);
    const playerSocket = await connectSocket(baseUrl, player.accessToken);
    openSockets.push(coachSocket, playerSocket);
    coachSocket.emit('channel:join', { channelKey: 'org' });
    playerSocket.emit('channel:join', { channelKey: 'org' });

    const upload = await request(server)
      .post('/chat/media')
      .set('Authorization', `Bearer ${coach.accessToken}`)
      .attach('file', TINY_JPEG, { filename: 'shot.jpg', contentType: 'image/jpeg' })
      .expect(201);
    expect(upload.body.mediaType).toBe('IMAGE');
    expect(upload.body.mediaUrl).toMatch(/^\/chat\/files\//);

    const clientId = 'pending:123:abc';
    const playerSees = waitForEvent<any>(playerSocket, 'message:new');
    const coachEcho = waitForEvent<any>(coachSocket, 'message:new');
    const ack = await emitAck<{ ok: boolean; id?: string; clientId?: string }>(
      coachSocket,
      'message:send',
      { channelKey: 'org', mediaUrl: upload.body.mediaUrl, mediaType: 'IMAGE', clientId },
    );
    expect(ack.ok).toBe(true);
    expect(ack.clientId).toBe(clientId);

    const echo = await coachEcho;
    expect(echo.clientId).toBe(clientId); // what swaps the optimistic bubble
    expect(echo.mediaType).toBe('IMAGE');
    expect(echo.mediaUrl).toMatch(/^\/chat\/files\//);

    const live = await playerSees;
    expect(live.mediaType).toBe('IMAGE');
    // The live broadcast carries the sender-minted URL; it must still work for the other member.
    const liveImg = await request(server).get(live.mediaUrl).expect(200);
    expect(liveImg.headers['content-type']).toMatch(/^image\/jpeg/);

    // History for the other member (rescoped URL) also serves the bytes.
    const history = await request(server)
      .get('/chat/messages?channelKey=org')
      .set('Authorization', `Bearer ${player.accessToken}`)
      .expect(200);
    const msg = history.body.find((m: any) => m.id === ack.id);
    expect(msg).toBeTruthy();
    expect(msg.mediaType).toBe('IMAGE');
    const histImg = await request(server).get(msg.mediaUrl).expect(200);
    expect(histImg.headers['content-type']).toMatch(/^image\/jpeg/);
  });

  it('a video upload is accepted and typed VIDEO', async () => {
    const { coach } = await setUpOrgWithPlayer();
    const upload = await request(server)
      .post('/chat/media')
      .set('Authorization', `Bearer ${coach.accessToken}`)
      .attach('file', Buffer.from('not really mp4 bytes'), { filename: 'clip.mp4', contentType: 'video/mp4' })
      .expect(201);
    expect(upload.body.mediaType).toBe('VIDEO');
    expect(upload.body.mediaUrl).toMatch(/^\/chat\/files\//);
  });
});
