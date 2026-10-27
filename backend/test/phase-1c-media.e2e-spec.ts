import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, getPrisma, resetDatabase, cleanUploadsDir } from './utils/test-app';
import { signup, createOrgAs, joinOrgAs, TINY_JPEG } from './utils/fixtures';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Phase 1C — Media upload (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    prisma = getPrisma(app);
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
    await cleanUploadsDir();
  });

  afterEach(async () => {
    await resetDatabase(prisma);
  });

  async function setUpOrgWithPlayer() {
    const coach = await signup(server, { name: 'Coach' });
    const org = await createOrgAs(server, coach.accessToken, 'COACH');
    const player = await signup(server, { name: 'Player' });
    await joinOrgAs(server, player.accessToken, org.orgCode);
    return { coach, org, player };
  }

  describe('POST /media', () => {
    it('requires authentication', async () => {
      await request(server)
        .post('/media')
        .field('type', 'IMAGE')
        .attach('file', TINY_JPEG, { filename: 'shot.jpg', contentType: 'image/jpeg' })
        .expect(401);
    });

    it('uploads an image and returns a usable media-files URL', async () => {
      const { player } = await setUpOrgWithPlayer();

      const res = await request(server)
        .post('/media')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .field('type', 'IMAGE')
        .field('caption', 'Scrim scoreboard')
        .attach('file', TINY_JPEG, { filename: 'shot.jpg', contentType: 'image/jpeg' })
        .expect(201);

      expect(res.body.type).toBe('IMAGE');
      expect(res.body.url).toMatch(
        /^\/media\/files\/[A-Za-z0-9]+\.jpg\?token=[\w-]+\.[\w-]+\.[\w-]+$/,
      );
      expect(res.body.caption).toBe('Scrim scoreboard');
      expect(res.body.uploaderId).toBe(player.user.id);

      // The signed, single-file, short-lived token embedded in the URL is
      // what grants access now — no bearer header needed, since <Image> and
      // Linking.openURL can't attach one.
      const fileRes = await request(server).get(res.body.url);
      expect(fileRes.status).toBe(200);
      expect(fileRes.headers['content-type']).toMatch(/image\/jpeg/);
    });

    it('rejects a non-image/video file', async () => {
      const { player } = await setUpOrgWithPlayer();
      await request(server)
        .post('/media')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .field('type', 'IMAGE')
        .attach('file', Buffer.from('just some text'), {
          filename: 'notes.txt',
          contentType: 'text/plain',
        })
        .expect(400);
    });

    it('rejects an invalid `type` value', async () => {
      const { player } = await setUpOrgWithPlayer();
      await request(server)
        .post('/media')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .field('type', 'SCREENSHOT') // not IMAGE or VIDEO
        .attach('file', TINY_JPEG, { filename: 'shot.jpg', contentType: 'image/jpeg' })
        .expect(400);
    });

    it('rejects a request with no file attached', async () => {
      const { player } = await setUpOrgWithPlayer();
      await request(server)
        .post('/media')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .field('type', 'IMAGE')
        .expect(400);
    });

    it('refuses an upload from a user not in any org', async () => {
      const outsider = await signup(server);
      await request(server)
        .post('/media')
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .field('type', 'IMAGE')
        .attach('file', TINY_JPEG, { filename: 'shot.jpg', contentType: 'image/jpeg' })
        .expect(404);
    });

    it('does not block the response on the push-notification send, even with a coach push token set', async () => {
      const { coach, player } = await setUpOrgWithPlayer();
      await request(server)
        .patch('/users/me/push-token')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .send({ token: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
        .expect(200);

      const start = Date.now();
      await request(server)
        .post('/media')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .field('type', 'IMAGE')
        .attach('file', TINY_JPEG, { filename: 'shot.jpg', contentType: 'image/jpeg' })
        .expect(201);
      const elapsedMs = Date.now() - start;

      // Generous bound — the point is "not hung waiting on an external HTTP
      // call", not a strict performance assertion.
      expect(elapsedMs).toBeLessThan(5000);
    });
  });

  describe('GET /media', () => {
    it('requires authentication', async () => {
      await request(server).get('/media').expect(401);
    });

    it('404s for a user not in any org', async () => {
      const outsider = await signup(server);
      await request(server)
        .get('/media')
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .expect(404);
    });

    it('lists org media newest-first', async () => {
      const { player } = await setUpOrgWithPlayer();

      await request(server)
        .post('/media')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .field('type', 'IMAGE')
        .field('caption', 'First')
        .attach('file', TINY_JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' })
        .expect(201);
      await request(server)
        .post('/media')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .field('type', 'IMAGE')
        .field('caption', 'Second')
        .attach('file', TINY_JPEG, { filename: 'b.jpg', contentType: 'image/jpeg' })
        .expect(201);

      const res = await request(server)
        .get('/media')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .expect(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].caption).toBe('Second');
      expect(res.body[1].caption).toBe('First');
    });

    it('filters by uploaderId', async () => {
      const { coach, org, player } = await setUpOrgWithPlayer();
      const player2 = await signup(server, { name: 'Player 2' });
      await joinOrgAs(server, player2.accessToken, org.orgCode);

      await request(server)
        .post('/media')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .field('type', 'IMAGE')
        .attach('file', TINY_JPEG, { filename: 'p1.jpg', contentType: 'image/jpeg' })
        .expect(201);
      await request(server)
        .post('/media')
        .set('Authorization', `Bearer ${player2.accessToken}`)
        .field('type', 'IMAGE')
        .attach('file', TINY_JPEG, { filename: 'p2.jpg', contentType: 'image/jpeg' })
        .expect(201);

      const res = await request(server)
        .get(`/media?uploaderId=${player.user.id}`)
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].uploaderId).toBe(player.user.id);
    });

    it('SECURITY: never shows another org\'s media', async () => {
      const { player: playerA } = await setUpOrgWithPlayer();
      await request(server)
        .post('/media')
        .set('Authorization', `Bearer ${playerA.accessToken}`)
        .field('type', 'IMAGE')
        .field('caption', 'Org A secret scoreboard')
        .attach('file', TINY_JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' })
        .expect(201);

      const { player: playerB } = await setUpOrgWithPlayer();
      const res = await request(server)
        .get('/media')
        .set('Authorization', `Bearer ${playerB.accessToken}`)
        .expect(200);
      expect(res.body).toHaveLength(0);
    });
  });

  describe('GET /media/files/:fileKey (guarded)', () => {
    it('404s for an unknown file key', async () => {
      await request(server).get('/media/files/this-file-does-not-exist.jpg').expect(404);
    });

    it('SECURITY: 404s for a real file key with no token at all', async () => {
      const { player } = await setUpOrgWithPlayer();
      const uploadRes = await request(server)
        .post('/media')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .field('type', 'IMAGE')
        .attach('file', TINY_JPEG, { filename: 'shot.jpg', contentType: 'image/jpeg' })
        .expect(201);
      const fileKey = (uploadRes.body.url as string).split('?')[0];

      await request(server).get(fileKey).expect(404);
    });

    it('SECURITY: 404s for a garbage/forged token', async () => {
      const { player } = await setUpOrgWithPlayer();
      const uploadRes = await request(server)
        .post('/media')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .field('type', 'IMAGE')
        .attach('file', TINY_JPEG, { filename: 'shot.jpg', contentType: 'image/jpeg' })
        .expect(201);
      const fileKey = (uploadRes.body.url as string).split('?')[0];

      await request(server).get(`${fileKey}?token=not-a-real-token`).expect(404);
    });

    it("SECURITY: a token signed for one org's file can't be reused for another org's file key", async () => {
      const { player: playerA } = await setUpOrgWithPlayer();
      const uploadA = await request(server)
        .post('/media')
        .set('Authorization', `Bearer ${playerA.accessToken}`)
        .field('type', 'IMAGE')
        .attach('file', TINY_JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' })
        .expect(201);
      const [, tokenA] = (uploadA.body.url as string).split('?token=');

      const { player: playerB } = await setUpOrgWithPlayer();
      const uploadB = await request(server)
        .post('/media')
        .set('Authorization', `Bearer ${playerB.accessToken}`)
        .field('type', 'IMAGE')
        .attach('file', TINY_JPEG, { filename: 'b.jpg', contentType: 'image/jpeg' })
        .expect(201);
      const fileKeyB = (uploadB.body.url as string).split('?')[0];

      // playerA's valid, unexpired token — but for a file it was never
      // issued for — must not unlock playerB's file.
      await request(server).get(`${fileKeyB}?token=${tokenA}`).expect(404);
    });

    it('a teammate (not just the uploader) can fetch the file through their own request to the same URL', async () => {
      const { coach, player } = await setUpOrgWithPlayer();
      const uploadRes = await request(server)
        .post('/media')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .field('type', 'IMAGE')
        .attach('file', TINY_JPEG, { filename: 'shot.jpg', contentType: 'image/jpeg' })
        .expect(201);

      // listOrgMedia re-signs a fresh, teammate-scoped token for the same
      // file when the player lists media — that's the URL they'd actually use.
      const listRes = await request(server)
        .get('/media')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .expect(200);
      expect(listRes.body[0].url).not.toBe(uploadRes.body.url); // different token, same file

      const fileRes = await request(server).get(listRes.body[0].url);
      expect(fileRes.status).toBe(200);
    });
  });
});
