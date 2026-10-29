import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, getPrisma, resetDatabase, cleanUploadsDir } from './utils/test-app';
import { signup, createOrgAs, joinOrgAs, uploadMedia, TINY_JPEG } from './utils/fixtures';
import { PrismaService } from '../src/prisma/prisma.service';
import { StatsService } from '../src/stats/stats.service';

describe('Phase 1F — AI stat extraction (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaService;
  let statsService: StatsService;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    prisma = getPrisma(app);
    statsService = app.get(StatsService);
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

  // Bypasses the real Gemini call (no key in this test env) by writing a
  // StatExtraction row directly, the same shape a completed worker run would
  // have produced (status PENDING, not the QUEUED a fresh POST creates it
  // as). Lets every endpoint *downstream* of OCR (list/edit/confirm/reject/
  // leaderboard) be tested for real, which is everything except OCR itself.
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
      damage?: number;
    }>,
    mode: 'BR' | 'CS' | 'SCRIM' | 'TOURNAMENT' = 'BR',
    status: 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'FAILED' = 'PENDING',
  ) {
    return prisma.statExtraction.create({
      data: {
        orgId,
        mediaPostId,
        requestedById,
        mode,
        status,
        rows: rows.map((r) => ({ ...r, damage: r.damage ?? 0 })) as any,
      },
    });
  }

  describe('POST /stats/extractions', () => {
    it('requires authentication', async () => {
      await request(server).post('/stats/extractions').send({ mode: 'BR', mediaPostIds: ['x'] }).expect(401);
    });

    it('404s for a user not in any org', async () => {
      const outsider = await signup(server);
      await request(server)
        .post('/stats/extractions')
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .send({ mode: 'BR', mediaPostIds: ['x'] })
        .expect(404);
    });

    it('404s for a nonexistent media post', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      await request(server)
        .post('/stats/extractions')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .send({ mode: 'BR', mediaPostIds: ['does-not-exist'] })
        .expect(404);
    });

    it("SECURITY: 404s for a media post that belongs to a different org", async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      const media = await uploadMedia(server, player1.accessToken);

      const { player1: otherOrgPlayer } = await setUpOrgWithTwoPlayers();
      await request(server)
        .post('/stats/extractions')
        .set('Authorization', `Bearer ${otherOrgPlayer.accessToken}`)
        .send({ mode: 'BR', mediaPostIds: [media.id] })
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
        .send({ mode: 'BR', mediaPostIds: [videoRes.body.id] })
        .expect(400);
    });

    it('rejects a batch bigger than 10 screenshots', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      await request(server)
        .post('/stats/extractions')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .send({ mode: 'BR', mediaPostIds: Array.from({ length: 11 }, (_, i) => `id-${i}`) })
        .expect(400);
    });

    it('creates a QUEUED extraction per screenshot in one request, with no Gemini call made yet', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      const media1 = await uploadMedia(server, player1.accessToken);
      const media2 = await uploadMedia(server, player1.accessToken);

      const res = await request(server)
        .post('/stats/extractions')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .send({ mode: 'BR', mediaPostIds: [media1.id, media2.id] })
        .expect(201);

      expect(res.body.created).toHaveLength(2);
      expect(res.body.skipped).toHaveLength(0);
      for (const extraction of res.body.created) {
        expect(extraction.status).toBe('QUEUED');
        expect(extraction.rows).toEqual([]);
      }
    });

    it('skips (does not fail the batch for) a screenshot that already has an extraction', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      const org = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });
      const dup = await uploadMedia(server, player1.accessToken);
      await seedExtraction(org.orgId, dup.id, player1.user.id, []);
      const fresh = await uploadMedia(server, player1.accessToken);

      const res = await request(server)
        .post('/stats/extractions')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .send({ mode: 'BR', mediaPostIds: [dup.id, fresh.id] })
        .expect(201);

      expect(res.body.created).toHaveLength(1);
      expect(res.body.created[0].mediaPostId).toBe(fresh.id);
      expect(res.body.skipped).toEqual([
        { mediaPostId: dup.id, reason: expect.stringMatching(/already has/) },
      ]);
    });

    it('the worker marks a QUEUED extraction FAILED when GEMINI_API_KEY is not configured, with a clear reason', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      const media = await uploadMedia(server, player1.accessToken);

      const createRes = await request(server)
        .post('/stats/extractions')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .send({ mode: 'BR', mediaPostIds: [media.id] })
        .expect(201);
      const extractionId = createRes.body.created[0].id;

      // Drives the same code path StatsExtractionWorkerService's setInterval
      // tick calls, directly and deterministically instead of waiting ~5s
      // for the real timer.
      await statsService.processQueuedExtraction(extractionId);

      const res = await request(server)
        .get(`/stats/extractions/${extractionId}`)
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .expect(200);
      expect(res.body.status).toBe('FAILED');
      expect(res.body.failureReason).toMatch(/GEMINI_API_KEY/);
    });
  });

  describe('POST /stats/extractions/:id/retry', () => {
    async function seedFailedExtraction(player1: any) {
      const org = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });
      const media = await uploadMedia(server, player1.accessToken);
      return prisma.statExtraction.create({
        data: {
          orgId: org.orgId,
          mediaPostId: media.id,
          requestedById: player1.user.id,
          mode: 'BR',
          status: 'FAILED',
          failureReason: 'Gemini could not read this image: boom',
          rows: [],
        },
      });
    }

    it('lets the original requester retry, resetting it back to QUEUED', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      const extraction = await seedFailedExtraction(player1);

      const res = await request(server)
        .post(`/stats/extractions/${extraction.id}/retry`)
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .expect(201);
      expect(res.body.status).toBe('QUEUED');
      expect(res.body.failureReason).toBeNull();
    });

    it('SECURITY: refuses retry from a teammate who did not request it and is not a coach', async () => {
      const { player1, player2 } = await setUpOrgWithTwoPlayers();
      const extraction = await seedFailedExtraction(player1);

      await request(server)
        .post(`/stats/extractions/${extraction.id}/retry`)
        .set('Authorization', `Bearer ${player2.accessToken}`)
        .expect(403);
    });

    it('rejects retrying an extraction that is not FAILED', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      const org = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });
      const media = await uploadMedia(server, player1.accessToken);
      const extraction = await seedExtraction(org.orgId, media.id, player1.user.id, []);

      await request(server)
        .post(`/stats/extractions/${extraction.id}/retry`)
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .expect(400);
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

  describe('GET /stats/extractions/:id', () => {
    it('requires authentication', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });
      const media = await uploadMedia(server, player1.accessToken);
      const extraction = await seedExtraction(membership.orgId, media.id, player1.user.id, []);
      await request(server).get(`/stats/extractions/${extraction.id}`).expect(401);
    });

    it('fetches a single extraction by id, for polling after upload', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });
      const media = await uploadMedia(server, player1.accessToken);
      const extraction = await seedExtraction(membership.orgId, media.id, player1.user.id, [
        { rawName: 'Player 1', matchedUserId: player1.user.id, kills: 1, deaths: 0, assists: 0 },
      ]);

      const res = await request(server)
        .get(`/stats/extractions/${extraction.id}`)
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .expect(200);
      expect(res.body.id).toBe(extraction.id);
      expect(res.body.status).toBe('PENDING');
    });

    it("SECURITY: 404s for another org's extraction", async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });
      const media = await uploadMedia(server, player1.accessToken);
      const extraction = await seedExtraction(membership.orgId, media.id, player1.user.id, []);

      const { player1: outsider } = await setUpOrgWithTwoPlayers();
      await request(server)
        .get(`/stats/extractions/${extraction.id}`)
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .expect(404);
    });
  });

  describe('PATCH /stats/extractions/:id (edit rows)', () => {
    it('SECURITY: the original requester alone can no longer edit — coach or owner only', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });
      const media = await uploadMedia(server, player1.accessToken);
      const extraction = await seedExtraction(membership.orgId, media.id, player1.user.id, []);

      await request(server)
        .patch(`/stats/extractions/${extraction.id}`)
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .send({ rows: [] })
        .expect(403);
    });

    it('lets a coach correct an unmatched name, even when they did not request the extraction', async () => {
      const { coach, player1, player2 } = await setUpOrgWithTwoPlayers();
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });
      const media = await uploadMedia(server, player1.accessToken);
      const extraction = await seedExtraction(membership.orgId, media.id, player1.user.id, [
        { rawName: 'XxUnknownXx', matchedUserId: null, kills: 9, deaths: 11, assists: 2 },
      ]);

      const res = await request(server)
        .patch(`/stats/extractions/${extraction.id}`)
        .set('Authorization', `Bearer ${coach.accessToken}`)
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

    it('creates a PlayerStat only for matched rows (including damage), and skips unmatched ones', async () => {
      const { coach, player1, player2 } = await setUpOrgWithTwoPlayers();
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });
      const media = await uploadMedia(server, player1.accessToken);
      const extraction = await seedExtraction(membership.orgId, media.id, player1.user.id, [
        { rawName: 'Player 1', matchedUserId: player1.user.id, kills: 18, deaths: 10, assists: 4, damage: 1200 },
        { rawName: 'Player 2', matchedUserId: player2.user.id, kills: 12, deaths: 14, assists: 7, damage: 900 },
        { rawName: 'XxUnknownXx', matchedUserId: null, kills: 9, deaths: 11, assists: 2 },
      ]);

      const res = await request(server)
        .post(`/stats/extractions/${extraction.id}/confirm`)
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(201);
      expect(res.body.confirmedRows).toBe(2);
      expect(res.body.skippedRows).toBe(1);

      const stats = await prisma.playerStat.findMany({ where: { extractionId: extraction.id } });
      expect(stats).toHaveLength(2);
      expect(stats.find((s) => s.userId === player1.user.id)?.damage).toBe(1200);
      expect(stats.find((s) => s.userId === player2.user.id)?.damage).toBe(900);

      const updated = await prisma.statExtraction.findUniqueOrThrow({ where: { id: extraction.id } });
      expect(updated.status).toBe('CONFIRMED');
      // Unmatched outsiders are dropped from the stored rows on confirm.
      expect(updated.rows as any[]).toHaveLength(2);
      expect((updated.rows as any[]).every((r) => r.matchedUserId)).toBe(true);
    });

    it('refuses to confirm when no rows are matched to teammates', async () => {
      const { coach, player1 } = await setUpOrgWithTwoPlayers();
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });
      const media = await uploadMedia(server, player1.accessToken);
      const extraction = await seedExtraction(membership.orgId, media.id, player1.user.id, [
        { rawName: 'RandomLobbyPlayer', matchedUserId: null, kills: 9, deaths: 1, assists: 0 },
      ]);

      await request(server)
        .post(`/stats/extractions/${extraction.id}/confirm`)
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(400);

      const stats = await prisma.playerStat.findMany({ where: { extractionId: extraction.id } });
      expect(stats).toHaveLength(0);
    });

    it('refuses to confirm the same extraction twice', async () => {
      const { coach, player1 } = await setUpOrgWithTwoPlayers();
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });
      const media = await uploadMedia(server, player1.accessToken);
      const extraction = await seedExtraction(membership.orgId, media.id, player1.user.id, [
        { rawName: 'Player 1', matchedUserId: player1.user.id, kills: 1, deaths: 1, assists: 1 },
      ]);

      await request(server)
        .post(`/stats/extractions/${extraction.id}/confirm`)
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(201);
      await request(server)
        .post(`/stats/extractions/${extraction.id}/confirm`)
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(400);

      // Confirming twice must never double-count the stats.
      const stats = await prisma.playerStat.findMany({ where: { extractionId: extraction.id } });
      expect(stats).toHaveLength(1);
    });
  });

  describe('POST /stats/extractions/:id/reject', () => {
    it('marks the extraction rejected and creates no PlayerStat rows', async () => {
      const { coach, player1 } = await setUpOrgWithTwoPlayers();
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });
      const media = await uploadMedia(server, player1.accessToken);
      const extraction = await seedExtraction(membership.orgId, media.id, player1.user.id, [
        { rawName: 'Player 1', matchedUserId: player1.user.id, kills: 1, deaths: 1, assists: 1 },
      ]);

      await request(server)
        .post(`/stats/extractions/${extraction.id}/reject`)
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(201);

      const stats = await prisma.playerStat.findMany({ where: { extractionId: extraction.id } });
      expect(stats).toHaveLength(0);

      const leaderboard = await request(server)
        .get('/stats/leaderboard?mode=BR')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .expect(200);
      expect(leaderboard.body).toHaveLength(0);
    });

    it('refuses to reject an already-confirmed extraction', async () => {
      const { coach, player1 } = await setUpOrgWithTwoPlayers();
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });
      const media = await uploadMedia(server, player1.accessToken);
      const extraction = await seedExtraction(membership.orgId, media.id, player1.user.id, [
        { rawName: 'Player 1', matchedUserId: player1.user.id, kills: 1, deaths: 1, assists: 1 },
      ]);

      await request(server)
        .post(`/stats/extractions/${extraction.id}/confirm`)
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(201);
      await request(server)
        .post(`/stats/extractions/${extraction.id}/reject`)
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(400);
    });
  });

  describe('GET /stats/leaderboard', () => {
    it('requires authentication', async () => {
      await request(server).get('/stats/leaderboard?mode=BR').expect(401);
    });

    it('aggregates confirmed stats (including damage) across matches, sorted by kills descending', async () => {
      const { coach, player1, player2 } = await setUpOrgWithTwoPlayers();
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });

      const media1 = await uploadMedia(server, player1.accessToken);
      const extraction1 = await seedExtraction(membership.orgId, media1.id, player1.user.id, [
        { rawName: 'Player 1', matchedUserId: player1.user.id, kills: 10, deaths: 5, assists: 1, damage: 500 },
        { rawName: 'Player 2', matchedUserId: player2.user.id, kills: 20, deaths: 2, assists: 3, damage: 800 },
      ]);
      await request(server)
        .post(`/stats/extractions/${extraction1.id}/confirm`)
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(201);

      const media2 = await uploadMedia(server, player1.accessToken);
      const extraction2 = await seedExtraction(membership.orgId, media2.id, player1.user.id, [
        { rawName: 'Player 1', matchedUserId: player1.user.id, kills: 15, deaths: 3, assists: 2, damage: 650 },
      ]);
      await request(server)
        .post(`/stats/extractions/${extraction2.id}/confirm`)
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(201);

      const res = await request(server)
        .get('/stats/leaderboard?mode=BR')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .expect(200);
      expect(res.body[0].name).toBe('Player 1');
      expect(res.body[0].kills).toBe(25);
      expect(res.body[0].damage).toBe(1150);
      expect(res.body[0].matches).toBe(2);
      expect(res.body[1].name).toBe('Player 2');
      expect(res.body[1].kills).toBe(20);
      expect(res.body[1].damage).toBe(800);
    });
  });

  describe('GET /stats/players/:id', () => {
    it('requires authentication', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      await request(server).get(`/stats/players/${player1.user.id}`).expect(401);
    });

    it("lets a teammate view another player's stat history and totals (including damage)", async () => {
      const { coach, player1 } = await setUpOrgWithTwoPlayers();
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });
      const media = await uploadMedia(server, player1.accessToken);
      const extraction = await seedExtraction(membership.orgId, media.id, player1.user.id, [
        { rawName: 'Player 1', matchedUserId: player1.user.id, kills: 18, deaths: 10, assists: 4, damage: 1100 },
      ]);
      await request(server)
        .post(`/stats/extractions/${extraction.id}/confirm`)
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(201);

      const res = await request(server)
        .get(`/stats/players/${player1.user.id}?mode=BR`)
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(200);
      expect(res.body.mode).toBe('BR');
      expect(res.body.totals).toEqual({ kills: 18, deaths: 10, assists: 4, damage: 1100 });
      expect(res.body.matches).toBe(1);
      expect(res.body.nextCursor).toBeNull();
    });

    it('SECURITY: refuses to show stats across org boundaries', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      const { player1: outsider } = await setUpOrgWithTwoPlayers();

      await request(server)
        .get(`/stats/players/${player1.user.id}?mode=BR`)
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .expect(403);
    });

    it('paginates match history with a cursor, while totals always reflect the FULL history', async () => {
      const { coach, player1 } = await setUpOrgWithTwoPlayers();
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });

      for (let i = 0; i < 3; i++) {
        const media = await uploadMedia(server, player1.accessToken);
        const extraction = await seedExtraction(membership.orgId, media.id, player1.user.id, [
          { rawName: 'Player 1', matchedUserId: player1.user.id, kills: 10, deaths: 1, assists: 1, damage: 100 },
        ]);
        await request(server)
          .post(`/stats/extractions/${extraction.id}/confirm`)
          .set('Authorization', `Bearer ${coach.accessToken}`)
          .expect(201);
      }

      const page1 = await request(server)
        .get(`/stats/players/${player1.user.id}?mode=BR&limit=2`)
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(200);
      expect(page1.body.entries).toHaveLength(2);
      expect(page1.body.matches).toBe(3);
      expect(page1.body.totals.kills).toBe(30);
      expect(page1.body.nextCursor).toEqual(expect.any(String));

      const page2 = await request(server)
        .get(`/stats/players/${player1.user.id}?mode=BR&limit=2&cursor=${page1.body.nextCursor}`)
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(200);
      expect(page2.body.entries).toHaveLength(1);
      expect(page2.body.nextCursor).toBeNull();

      const pagedIds = [...page1.body.entries, ...page2.body.entries].map((e: any) => e.id);
      expect(new Set(pagedIds).size).toBe(3);
    });
  });

  describe('GET /stats/history', () => {
    it('paginates with a cursor, newest first', async () => {
      const { coach, player1 } = await setUpOrgWithTwoPlayers();
      const membership = await prisma.membership.findFirstOrThrow({ where: { userId: player1.user.id } });

      for (let i = 0; i < 3; i++) {
        const media = await uploadMedia(server, player1.accessToken);
        const extraction = await seedExtraction(membership.orgId, media.id, player1.user.id, [
          { rawName: 'Player 1', matchedUserId: player1.user.id, kills: i, deaths: 0, assists: 0 },
        ]);
        await request(server)
          .post(`/stats/extractions/${extraction.id}/confirm`)
          .set('Authorization', `Bearer ${coach.accessToken}`)
          .expect(201);
      }

      const page1 = await request(server)
        .get('/stats/history?mode=BR&limit=2')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .expect(200);
      expect(page1.body.entries).toHaveLength(2);
      expect(page1.body.nextCursor).toEqual(expect.any(String));

      const page2 = await request(server)
        .get(`/stats/history?mode=BR&limit=2&cursor=${page1.body.nextCursor}`)
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .expect(200);
      expect(page2.body.entries).toHaveLength(1);
      expect(page2.body.nextCursor).toBeNull();

      const pagedIds = [...page1.body.entries, ...page2.body.entries].map((e: any) => e.id);
      expect(new Set(pagedIds).size).toBe(3);
    });
  });
});
