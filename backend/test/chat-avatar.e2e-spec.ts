import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  createTestApp,
  getPrisma,
  resetDatabase,
  listenOnEphemeralPort,
} from './utils/test-app';
import { signup, createOrgAs, joinOrgAs, TINY_JPEG } from './utils/fixtures';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Group-chat (org / guild) avatar + profile avatar: upload must persist AND
 * the URL the API hands back must actually serve the image. In the test env
 * there is no Cloudinary, so these go through the signed /media/files route —
 * the same path a dev build on a laptop uses.
 */
describe('Chat channel avatar + profile avatar (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    await listenOnEphemeralPort(app);
    prisma = getPrisma(app);
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  afterEach(async () => {
    await resetDatabase(prisma);
  });

  async function setUpOrgWithPlayer() {
    const coach = await signup(server, { name: 'Coach' });
    const org = await createOrgAs(server, coach.accessToken, 'COACH');
    const player = await signup(server, { name: 'Player' });
    await joinOrgAs(server, player.accessToken, org.rosterCode);
    return { coach, org, player };
  }

  it('owner uploads a team-chat photo: it is saved, returned by GET /chat/meta and /chat/channels, and the URL serves the image to every member', async () => {
    const { coach, player } = await setUpOrgWithPlayer();

    const upload = await request(server)
      .post('/chat/meta/avatar')
      .set('Authorization', `Bearer ${coach.accessToken}`)
      .field('channelKey', 'org')
      .attach('file', TINY_JPEG, { filename: 'group.jpg', contentType: 'image/jpeg' })
      .expect(201);
    expect(upload.body.channelKey).toBe('org');
    expect(upload.body.avatarUrl).toEqual(expect.any(String));

    const meta = await request(server)
      .get('/chat/meta?channelKey=org')
      .set('Authorization', `Bearer ${player.accessToken}`)
      .expect(200);
    expect(meta.body.avatarUrl).toEqual(expect.any(String));

    const channels = await request(server)
      .get('/chat/channels')
      .set('Authorization', `Bearer ${player.accessToken}`)
      .expect(200);
    const orgChannel = channels.body.channels.find((c: any) => c.channelKey === 'org');
    expect(orgChannel.peerAvatarUrl).toEqual(expect.any(String));

    // The bit the app actually renders: the URL must serve the image.
    const img = await request(server).get(meta.body.avatarUrl).expect(200);
    expect(img.headers['content-type']).toMatch(/^image\/jpeg/);
  });

  it('a plain player cannot change the team-chat photo', async () => {
    const { player } = await setUpOrgWithPlayer();
    await request(server)
      .post('/chat/meta/avatar')
      .set('Authorization', `Bearer ${player.accessToken}`)
      .field('channelKey', 'org')
      .attach('file', TINY_JPEG, { filename: 'group.jpg', contentType: 'image/jpeg' })
      .expect(403);
  });

  it('profile avatar: uploaded, returned by GET /users/me, and the URL serves the image', async () => {
    const { coach } = await setUpOrgWithPlayer();
    const upload = await request(server)
      .post('/users/me/avatar')
      .set('Authorization', `Bearer ${coach.accessToken}`)
      .attach('file', TINY_JPEG, { filename: 'me.jpg', contentType: 'image/jpeg' })
      .expect(201);
    expect(upload.body.avatarUrl).toEqual(expect.any(String));

    const me = await request(server)
      .get('/users/me')
      .set('Authorization', `Bearer ${coach.accessToken}`)
      .expect(200);
    expect(me.body.avatarUrl).toEqual(expect.any(String));

    const img = await request(server).get(me.body.avatarUrl).expect(200);
    expect(img.headers['content-type']).toMatch(/^image\/jpeg/);
  });
});
