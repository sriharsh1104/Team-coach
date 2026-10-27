import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, getPrisma, resetDatabase, cleanUploadsDir } from './utils/test-app';
import { signup, createOrgAs, joinOrgAs, uploadMedia, TINY_JPEG } from './utils/fixtures';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Phase 1F — AI stat extraction (e2e)', () => {
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

  async function setUpOrgWithTwoPlayers() {
    const coach = await signup(server, { name: 'Coach' });
    const org = await createOrgAs(server, coach.accessToken, 'COACH');
    const player1 = await signup(server, { name: 'Player 1' });
    await joinOrgAs(server, player1.accessToken, org.orgCode);
    const player2 = await signup(server, { name: 'Player 2' });
    await joinOrgAs(server, player2.accessToken, org.orgCode);
    return { coach, org, player1, player2 };
  }

  // Bypasses the real Anthropic call (no key in this test env) by writing a
  // StatExtraction row directly, the same shape requestExtraction() would
  // have produced from a successful AI response. Lets every endpoint
  // *downstream* of the AI call (list/edit/confirm/reject/leaderboard) be
  // tested for real, which is everything except the AI call itself.
  async function seedExtraction(
    orgId: string,
    mediaPostId: string,
    requestedById: string,
    rows: Array<{
      rawName: string;
      matchedUserId: string | null;
      kills: number;
      deaths: number;
      assists: number;
    }>,
  ) {
    return prisma.statExtraction.create({
      data: { orgId, mediaPostId, requestedById, rows: rows as any },
    });
  }

  describe('POST /stats/extractions', () => {
    it('requires authentication', async () => {
      await request(server).post('/stats/extractions').send({ mediaPostId: 'x' }).expect(401);
    });

    it('404s for a user not in any org', async () => {
      const outsider = await signup(server);
      await request(server)
        .post('/stats/extractions')
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .send({ mediaPostId: 'x' })
        .expect(404);
    });

    it('404s for a nonexistent media post', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      await request(server)
        .post('/stats/extractions')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .send({ mediaPostId: 'does-not-exist' })
        .expect(404);
    });

    it("SECURITY: 404s for a media post that belongs to a different org", async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      const media = await uploadMedia(server, player1.accessToken);

      const { player1: otherOrgPlayer } = await setUpOrgWithTwoPlayers();
      await request(server)
        .post('/stats/extractions')
        .set('Authorization', `Bearer ${otherOrgPlayer.accessToken}`)
        .send({ mediaPostId: media.id })
        .expect(404);
    });

    it('rejects extraction on a VIDEO post — stat extraction only reads image screenshots', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      const videoRes = await request(server)
        .post('/media')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .field('type', 'VIDEO')
        .attach('file', TINY_JPEG, { filename: 'clip.mp4', contentType: 'video/mp4' })
        .expect(201);

      await request(server)
        .post('/stats/extractions')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .send({ mediaPostId: videoRes.body.id })
        .expect(400);
    });

    it('returns a clean 503 (not a crash) when ANTHROPIC_API_KEY is not configured', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      const media = await uploadMedia(server, player1.accessToken);

      const res = await request(server)
        .post('/stats/extractions')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .send({ mediaPostId: media.id })
        .expect(503);
      expect(res.body.message).toMatch(/ANTHROPIC_API_KEY/);
    });

    it('refuses a second extraction on a screenshot that already has one', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      const org = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });
      const media = await uploadMedia(server, player1.accessToken);
      await seedExtraction(org.orgId, media.id, player1.user.id, []);

      await request(server)
        .post('/stats/extractions')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .send({ mediaPostId: media.id })
        .expect(409);
    });
  });

  describe('GET /stats/extractions', () => {
    it('requires authentication', async () => {
      await request(server).get('/stats/extractions').expect(401);
    });

    it('404s for a user not in any org', async () => {
      const outsider = await signup(server);
      await request(server)
        .get('/stats/extractions')
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .expect(404);
    });

    it('lists a seeded extraction with the right shape', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });
      const media = await uploadMedia(server, player1.accessToken);
      await seedExtraction(membership.orgId, media.id, player1.user.id, [
        { rawName: 'Player 1', matchedUserId: player1.user.id, kills: 10, deaths: 5, assists: 2 },
      ]);

      const res = await request(server)
        .get('/stats/extractions')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].status).toBe('PENDING');
      const fileKey = media.url.split('/').pop()!.split('?')[0];
      expect(res.body[0].mediaUrl).toMatch(
        new RegExp(`^/media/files/${fileKey}\\?token=`),
      );
    });

    it("SECURITY: never lists another org's extractions", async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });
      const media = await uploadMedia(server, player1.accessToken);
      await seedExtraction(membership.orgId, media.id, player1.user.id, []);

      const { player1: otherOrgPlayer } = await setUpOrgWithTwoPlayers();
      const res = await request(server)
        .get('/stats/extractions')
        .set('Authorization', `Bearer ${otherOrgPlayer.accessToken}`)
        .expect(200);
      expect(res.body).toHaveLength(0);
    });
  });

  describe('PATCH /stats/extractions/:id (edit rows)', () => {
    it('lets the requester correct an unmatched name', async () => {
      const { player1, player2 } = await setUpOrgWithTwoPlayers();
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });
      const media = await uploadMedia(server, player1.accessToken);
      const extraction = await seedExtraction(membership.orgId, media.id, player1.user.id, [
        { rawName: 'XxUnknownXx', matchedUserId: null, kills: 9, deaths: 11, assists: 2 },
      ]);

      const res = await request(server)
        .patch(`/stats/extractions/${extraction.id}`)
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .send({
          rows: [
            { rawName: 'Player 2', matchedUserId: player2.user.id, kills: 9, deaths: 11, assists: 2 },
          ],
        })
        .expect(200);
      expect(res.body.rows[0].matchedUserId).toBe(player2.user.id);
    });

    it('SECURITY: refuses edit from a teammate who did not request it and is not a coach', async () => {
      const { player1, player2 } = await setUpOrgWithTwoPlayers();
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });
      const media = await uploadMedia(server, player1.accessToken);
      const extraction = await seedExtraction(membership.orgId, media.id, player1.user.id, []);

      await request(server)
        .patch(`/stats/extractions/${extraction.id}`)
        .set('Authorization', `Bearer ${player2.accessToken}`)
        .send({ rows: [] })
        .expect(403);
    });

    it('lets a coach edit even if they did not request the extraction', async () => {
      const { coach, player1 } = await setUpOrgWithTwoPlayers();
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });
      const media = await uploadMedia(server, player1.accessToken);
      const extraction = await seedExtraction(membership.orgId, media.id, player1.user.id, []);

      await request(server)
        .patch(`/stats/extractions/${extraction.id}`)
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .send({ rows: [] })
        .expect(200);
    });

    it("lets the org owner edit even when their own functional role is PLAYER, not COACH", async () => {
      const owner = await signup(server, { name: 'Owner-Player' });
      const org = await createOrgAs(server, owner.accessToken, 'PLAYER');
      const teammate = await signup(server, { name: 'Teammate' });
      await joinOrgAs(server, teammate.accessToken, org.orgCode);
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: teammate.user.id } });
      const media = await uploadMedia(server, teammate.accessToken);
      const extraction = await seedExtraction(membership.orgId, media.id, teammate.user.id, []);

      await request(server)
        .patch(`/stats/extractions/${extraction.id}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ rows: [] })
        .expect(200);
    });

    it('rejects a negative stat value', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });
      const media = await uploadMedia(server, player1.accessToken);
      const extraction = await seedExtraction(membership.orgId, media.id, player1.user.id, []);

      await request(server)
        .patch(`/stats/extractions/${extraction.id}`)
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .send({ rows: [{ rawName: 'x', matchedUserId: null, kills: -1, deaths: 0, assists: 0 }] })
        .expect(400);
    });

    it('rejects unexpected fields on a row (mass-assignment guard)', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });
      const media = await uploadMedia(server, player1.accessToken);
      const extraction = await seedExtraction(membership.orgId, media.id, player1.user.id, []);

      await request(server)
        .patch(`/stats/extractions/${extraction.id}`)
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .send({
          rows: [
            { rawName: 'x', matchedUserId: null, kills: 1, deaths: 0, assists: 0, extraField: 'nope' },
          ],
        })
        .expect(400);
    });
  });

  describe('POST /stats/extractions/:id/confirm', () => {
    it('SECURITY: refuses confirm from a teammate who did not request it and is not a coach', async () => {
      const { player1, player2 } = await setUpOrgWithTwoPlayers();
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });
      const media = await uploadMedia(server, player1.accessToken);
      const extraction = await seedExtraction(membership.orgId, media.id, player1.user.id, []);

      await request(server)
        .post(`/stats/extractions/${extraction.id}/confirm`)
        .set('Authorization', `Bearer ${player2.accessToken}`)
        .expect(403);
    });

    it('creates a PlayerStat only for matched rows, and skips unmatched ones', async () => {
      const { player1, player2 } = await setUpOrgWithTwoPlayers();
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });
      const media = await uploadMedia(server, player1.accessToken);
      const extraction = await seedExtraction(membership.orgId, media.id, player1.user.id, [
        { rawName: 'Player 1', matchedUserId: player1.user.id, kills: 18, deaths: 10, assists: 4 },
        { rawName: 'Player 2', matchedUserId: player2.user.id, kills: 12, deaths: 14, assists: 7 },
        { rawName: 'XxUnknownXx', matchedUserId: null, kills: 9, deaths: 11, assists: 2 },
      ]);

      const res = await request(server)
        .post(`/stats/extractions/${extraction.id}/confirm`)
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .expect(201);
      expect(res.body.confirmedRows).toBe(2);
      expect(res.body.skippedRows).toBe(1);

      const stats = await prisma.playerStat.findMany({ where: { extractionId: extraction.id } });
      expect(stats).toHaveLength(2);

      const updated = await prisma.statExtraction.findUniqueOrThrow({ where: { id: extraction.id } });
      expect(updated.status).toBe('CONFIRMED');
    });

    it('refuses to confirm the same extraction twice', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });
      const media = await uploadMedia(server, player1.accessToken);
      const extraction = await seedExtraction(membership.orgId, media.id, player1.user.id, [
        { rawName: 'Player 1', matchedUserId: player1.user.id, kills: 1, deaths: 1, assists: 1 },
      ]);

      await request(server)
        .post(`/stats/extractions/${extraction.id}/confirm`)
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .expect(201);
      await request(server)
        .post(`/stats/extractions/${extraction.id}/confirm`)
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .expect(400);

      // Confirming twice must never double-count the stats.
      const stats = await prisma.playerStat.findMany({ where: { extractionId: extraction.id } });
      expect(stats).toHaveLength(1);
    });
  });

  describe('POST /stats/extractions/:id/reject', () => {
    it('marks the extraction rejected and creates no PlayerStat rows', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });
      const media = await uploadMedia(server, player1.accessToken);
      const extraction = await seedExtraction(membership.orgId, media.id, player1.user.id, [
        { rawName: 'Player 1', matchedUserId: player1.user.id, kills: 1, deaths: 1, assists: 1 },
      ]);

      await request(server)
        .post(`/stats/extractions/${extraction.id}/reject`)
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .expect(201);

      const stats = await prisma.playerStat.findMany({ where: { extractionId: extraction.id } });
      expect(stats).toHaveLength(0);

      const leaderboard = await request(server)
        .get('/stats/leaderboard')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .expect(200);
      expect(leaderboard.body).toHaveLength(0);
    });

    it('refuses to reject an already-confirmed extraction', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });
      const media = await uploadMedia(server, player1.accessToken);
      const extraction = await seedExtraction(membership.orgId, media.id, player1.user.id, [
        { rawName: 'Player 1', matchedUserId: player1.user.id, kills: 1, deaths: 1, assists: 1 },
      ]);

      await request(server)
        .post(`/stats/extractions/${extraction.id}/confirm`)
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .expect(201);
      await request(server)
        .post(`/stats/extractions/${extraction.id}/reject`)
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .expect(400);
    });
  });

  describe('GET /stats/leaderboard', () => {
    it('requires authentication', async () => {
      await request(server).get('/stats/leaderboard').expect(401);
    });

    it('aggregates confirmed stats across matches, sorted by kills descending', async () => {
      const { player1, player2 } = await setUpOrgWithTwoPlayers();
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });

      const media1 = await uploadMedia(server, player1.accessToken);
      const extraction1 = await seedExtraction(membership.orgId, media1.id, player1.user.id, [
        { rawName: 'Player 1', matchedUserId: player1.user.id, kills: 10, deaths: 5, assists: 1 },
        { rawName: 'Player 2', matchedUserId: player2.user.id, kills: 20, deaths: 2, assists: 3 },
      ]);
      await request(server)
        .post(`/stats/extractions/${extraction1.id}/confirm`)
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .expect(201);

      const media2 = await uploadMedia(server, player1.accessToken);
      const extraction2 = await seedExtraction(membership.orgId, media2.id, player1.user.id, [
        { rawName: 'Player 1', matchedUserId: player1.user.id, kills: 15, deaths: 3, assists: 2 },
      ]);
      await request(server)
        .post(`/stats/extractions/${extraction2.id}/confirm`)
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .expect(201);

      const res = await request(server)
        .get('/stats/leaderboard')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .expect(200);
      expect(res.body[0].name).toBe('Player 1');
      expect(res.body[0].kills).toBe(25);
      expect(res.body[0].matches).toBe(2);
      expect(res.body[1].name).toBe('Player 2');
      expect(res.body[1].kills).toBe(20);
    });
  });

  describe('GET /stats/players/:id', () => {
    it('requires authentication', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      await request(server).get(`/stats/players/${player1.user.id}`).expect(401);
    });

    it("lets a teammate view another player's stat history and totals", async () => {
      const { coach, player1 } = await setUpOrgWithTwoPlayers();
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });
      const media = await uploadMedia(server, player1.accessToken);
      const extraction = await seedExtraction(membership.orgId, media.id, player1.user.id, [
        { rawName: 'Player 1', matchedUserId: player1.user.id, kills: 18, deaths: 10, assists: 4 },
      ]);
      await request(server)
        .post(`/stats/extractions/${extraction.id}/confirm`)
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .expect(201);

      const res = await request(server)
        .get(`/stats/players/${player1.user.id}`)
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(200);
      expect(res.body.totals).toEqual({ kills: 18, deaths: 10, assists: 4 });
      expect(res.body.matches).toBe(1);
    });

    it('SECURITY: refuses to show stats across org boundaries', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      const { player1: outsider } = await setUpOrgWithTwoPlayers();

      await request(server)
        .get(`/stats/players/${player1.user.id}`)
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .expect(403);
    });
  });
});
