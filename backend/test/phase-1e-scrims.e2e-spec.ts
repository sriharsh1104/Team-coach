import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, getPrisma, resetDatabase } from './utils/test-app';
import { signup, createOrgAs, joinOrgAs } from './utils/fixtures';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Phase 1E — Scrims & tournaments (e2e)', () => {
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

  describe('POST /scrims', () => {
    it('requires authentication', async () => {
      await request(server)
        .post('/scrims')
        .send({ type: 'SCRIM', title: 'x', scheduledAt: '2026-11-01T10:00:00.000Z' })
        .expect(401);
    });

    it('refuses creation from a user not in any org', async () => {
      const outsider = await signup(server);
      await request(server)
        .post('/scrims')
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .send({ type: 'SCRIM', title: 'x', scheduledAt: '2026-11-01T10:00:00.000Z' })
        .expect(404);
    });

    it('creates a scrim with full fields and reports the creator', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      const res = await request(server)
        .post('/scrims')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .send({
          type: 'SCRIM',
          title: 'Practice vs Team Beta',
          scheduledAt: '2026-11-01T20:00:00.000Z',
          platform: 'https://discord.gg/beta-scrim',
          notes: 'BO3',
        })
        .expect(201);
      expect(res.body.title).toBe('Practice vs Team Beta');
      expect(res.body.createdById).toBe(player1.user.id);
      expect(res.body.createdByName).toBe('Player 1');
    });

    it('creates a tournament entry with only the required fields', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      const res = await request(server)
        .post('/scrims')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .send({ type: 'TOURNAMENT', title: 'Weekend Cup', scheduledAt: '2026-11-02T15:00:00.000Z' })
        .expect(201);
      expect(res.body.platform).toBeNull();
      expect(res.body.notes).toBeNull();
    });

    it('rejects an invalid type', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      await request(server)
        .post('/scrims')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .send({ type: 'FRIENDLY', title: 'x', scheduledAt: '2026-11-01T10:00:00.000Z' })
        .expect(400);
    });

    it('rejects an empty title', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      await request(server)
        .post('/scrims')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .send({ type: 'SCRIM', title: '', scheduledAt: '2026-11-01T10:00:00.000Z' })
        .expect(400);
    });

    it('rejects a non-ISO scheduledAt', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      await request(server)
        .post('/scrims')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .send({ type: 'SCRIM', title: 'x', scheduledAt: 'next tuesday' })
        .expect(400);
    });

    it('rejects unexpected fields instead of silently accepting them (mass-assignment guard)', async () => {
      const { player1, player2 } = await setUpOrgWithTwoPlayers();
      await request(server)
        .post('/scrims')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .send({
          type: 'SCRIM',
          title: 'x',
          scheduledAt: '2026-11-01T10:00:00.000Z',
          createdById: player2.user.id, // attempt to frame someone else as the creator
        })
        .expect(400);
    });
  });

  describe('GET /scrims', () => {
    it('requires authentication', async () => {
      await request(server).get('/scrims').expect(401);
    });

    it('404s for a user not in any org', async () => {
      const outsider = await signup(server);
      await request(server)
        .get('/scrims')
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .expect(404);
    });

    it('lists entries sorted by scheduledAt ascending, regardless of creation order', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      await request(server)
        .post('/scrims')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .send({ type: 'SCRIM', title: 'Later', scheduledAt: '2026-12-01T10:00:00.000Z' })
        .expect(201);
      await request(server)
        .post('/scrims')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .send({ type: 'SCRIM', title: 'Sooner', scheduledAt: '2026-11-01T10:00:00.000Z' })
        .expect(201);

      const res = await request(server)
        .get('/scrims')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .expect(200);
      expect(res.body.map((e: any) => e.title)).toEqual(['Sooner', 'Later']);
    });

    it("SECURITY: never shows another org's scrims", async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      await request(server)
        .post('/scrims')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .send({ type: 'SCRIM', title: 'Org A secret scrim', scheduledAt: '2026-11-01T10:00:00.000Z' })
        .expect(201);

      const { player1: otherOrgPlayer } = await setUpOrgWithTwoPlayers();
      const res = await request(server)
        .get('/scrims')
        .set('Authorization', `Bearer ${otherOrgPlayer.accessToken}`)
        .expect(200);
      expect(res.body).toHaveLength(0);
    });
  });

  describe('PATCH /scrims/:id', () => {
    async function createScrimAs(server: any, token: string, title = 'Original title') {
      const res = await request(server)
        .post('/scrims')
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'SCRIM', title, scheduledAt: '2026-11-01T10:00:00.000Z' })
        .expect(201);
      return res.body;
    }

    it('lets the creator edit their own entry', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      const scrim = await createScrimAs(server, player1.accessToken);

      const res = await request(server)
        .patch(`/scrims/${scrim.id}`)
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .send({ title: 'Updated title' })
        .expect(200);
      expect(res.body.title).toBe('Updated title');
    });

    it('lets a coach edit an entry someone else created', async () => {
      const { coach, player1 } = await setUpOrgWithTwoPlayers();
      const scrim = await createScrimAs(server, player1.accessToken);

      await request(server)
        .patch(`/scrims/${scrim.id}`)
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .send({ notes: 'Coach added a note' })
        .expect(200);
    });

    it("lets the org owner edit an entry they didn't create, even when their own functional role is PLAYER", async () => {
      const owner = await signup(server, { name: 'Owner-Player' });
      const org = await createOrgAs(server, owner.accessToken, 'PLAYER');
      const teammate = await signup(server, { name: 'Teammate' });
      await joinOrgAs(server, teammate.accessToken, org.orgCode);
      const scrim = await createScrimAs(server, teammate.accessToken);

      await request(server)
        .patch(`/scrims/${scrim.id}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ notes: 'Owner note, despite being a PLAYER not a COACH' })
        .expect(200);
    });

    it('SECURITY: refuses edit from a teammate who is neither the creator nor a coach', async () => {
      const { player1, player2 } = await setUpOrgWithTwoPlayers();
      const scrim = await createScrimAs(server, player1.accessToken);

      await request(server)
        .patch(`/scrims/${scrim.id}`)
        .set('Authorization', `Bearer ${player2.accessToken}`)
        .send({ title: 'Hijacked' })
        .expect(403);

      const stillOriginal = await request(server)
        .get('/scrims')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .expect(200);
      expect(stillOriginal.body[0].title).toBe('Original title');
    });

    it("SECURITY: 404s (not 403) when the entry belongs to a different org — doesn't confirm it exists", async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      const scrim = await createScrimAs(server, player1.accessToken);

      const { player1: otherOrgPlayer } = await setUpOrgWithTwoPlayers();
      await request(server)
        .patch(`/scrims/${scrim.id}`)
        .set('Authorization', `Bearer ${otherOrgPlayer.accessToken}`)
        .send({ title: 'Reach across org boundary' })
        .expect(404);
    });

    it('404s for a nonexistent entry', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      await request(server)
        .patch('/scrims/does-not-exist')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .send({ title: 'x' })
        .expect(404);
    });

    it('rejects unexpected fields (mass-assignment guard)', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      const scrim = await createScrimAs(server, player1.accessToken);
      await request(server)
        .patch(`/scrims/${scrim.id}`)
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .send({ title: 'x', orgId: 'attacker-chosen-org' })
        .expect(400);
    });
  });

  describe('DELETE /scrims/:id', () => {
    async function createScrimAs(server: any, token: string) {
      const res = await request(server)
        .post('/scrims')
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'SCRIM', title: 'To be deleted', scheduledAt: '2026-11-01T10:00:00.000Z' })
        .expect(201);
      return res.body;
    }

    it('lets the creator delete their own entry', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      const scrim = await createScrimAs(server, player1.accessToken);

      await request(server)
        .delete(`/scrims/${scrim.id}`)
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .expect(200);

      const list = await request(server)
        .get('/scrims')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .expect(200);
      expect(list.body).toHaveLength(0);
    });

    it('lets a coach delete an entry someone else created', async () => {
      const { coach, player1 } = await setUpOrgWithTwoPlayers();
      const scrim = await createScrimAs(server, player1.accessToken);

      await request(server)
        .delete(`/scrims/${scrim.id}`)
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(200);
    });

    it('SECURITY: refuses delete from a teammate who is neither the creator nor a coach', async () => {
      const { player1, player2 } = await setUpOrgWithTwoPlayers();
      const scrim = await createScrimAs(server, player1.accessToken);

      await request(server)
        .delete(`/scrims/${scrim.id}`)
        .set('Authorization', `Bearer ${player2.accessToken}`)
        .expect(403);

      const stillThere = await request(server)
        .get('/scrims')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .expect(200);
      expect(stillThere.body).toHaveLength(1);
    });

    it('404s for a nonexistent entry', async () => {
      const { player1 } = await setUpOrgWithTwoPlayers();
      await request(server)
        .delete('/scrims/does-not-exist')
        .set('Authorization', `Bearer ${player1.accessToken}`)
        .expect(404);
    });
  });
});
