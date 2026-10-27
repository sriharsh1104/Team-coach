import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, getPrisma, resetDatabase } from './utils/test-app';
import { signup, createOrgAs, joinOrgAs } from './utils/fixtures';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Phase 1B — Profile, roles, devices (e2e)', () => {
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

  describe('GET /users/me', () => {
    it('requires authentication', async () => {
      await request(server).get('/users/me').expect(401);
    });

    it('returns an empty default profile for a brand new user', async () => {
      const user = await signup(server);
      const res = await request(server)
        .get('/users/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);
      expect(res.body.roles).toEqual([]);
      expect(res.body.inGameName).toBeNull();
      expect(res.body.devices).toEqual([]);
    });

    it('never leaks passwordHash, email, or googleId in the profile response', async () => {
      const user = await signup(server);
      const res = await request(server)
        .get('/users/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);
      const keys = Object.keys(res.body);
      expect(keys).not.toContain('passwordHash');
      expect(keys).not.toContain('email');
      expect(keys).not.toContain('googleId');
      expect(keys).not.toContain('expoPushToken');
    });
  });

  describe('PATCH /users/me', () => {
    it('updates roles, IGN/UID, and social links', async () => {
      const user = await signup(server);
      const res = await request(server)
        .patch('/users/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          roles: ['IGL', 'SNIPER'],
          inGameName: 'ShadowStrike',
          inGameUid: 'UID-42',
          discordUrl: 'https://discord.gg/example',
        })
        .expect(200);
      expect(res.body.roles).toEqual(['IGL', 'SNIPER']);
      expect(res.body.inGameName).toBe('ShadowStrike');
      expect(res.body.discordUrl).toBe('https://discord.gg/example');
    });

    it('rejects a role outside the fixed role list', async () => {
      const user = await signup(server);
      await request(server)
        .patch('/users/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ roles: ['NOT_A_REAL_ROLE'] })
        .expect(400);
    });

    it('rejects a malformed URL in a social link field', async () => {
      const user = await signup(server);
      await request(server)
        .patch('/users/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ discordUrl: 'not a url at all' })
        .expect(400);
    });

    it('rejects unexpected fields instead of silently accepting them (mass-assignment guard)', async () => {
      const user = await signup(server);
      await request(server)
        .patch('/users/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ roles: ['IGL'], id: 'attacker-chosen-id', passwordHash: 'hijacked' })
        .expect(400);
    });

    it('requires authentication', async () => {
      await request(server).patch('/users/me').send({ roles: ['IGL'] }).expect(401);
    });

    it("cannot be used to modify another user's profile — the target is always the caller, never body-controlled", async () => {
      const victim = await signup(server, { name: 'Victim' });
      const attacker = await signup(server, { name: 'Attacker' });

      // There's no userId/targetId field in the DTO at all, so even trying to
      // smuggle one in should be rejected by the whitelist, not silently used.
      await request(server)
        .patch('/users/me')
        .set('Authorization', `Bearer ${attacker.accessToken}`)
        .send({ userId: victim.user.id, inGameName: 'Hijacked' })
        .expect(400);

      const victimProfile = await request(server)
        .get('/users/me')
        .set('Authorization', `Bearer ${victim.accessToken}`)
        .expect(200);
      expect(victimProfile.body.inGameName).toBeNull();
    });
  });

  describe('Devices', () => {
    it('adds a device and lists it', async () => {
      const user = await signup(server);
      await request(server)
        .post('/users/me/devices')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ name: 'Main rig', model: 'ROG Phone 8' })
        .expect(201);

      const res = await request(server)
        .get('/users/me/devices')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].model).toBe('ROG Phone 8');
    });

    it('rejects an empty device name', async () => {
      const user = await signup(server);
      await request(server)
        .post('/users/me/devices')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ name: '', model: 'Something' })
        .expect(400);
    });

    it('deletes only your own device', async () => {
      const user = await signup(server);
      const device = await request(server)
        .post('/users/me/devices')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ name: 'Main rig', model: 'ROG Phone 8' })
        .expect(201);

      await request(server)
        .delete(`/users/me/devices/${device.body.id}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      const res = await request(server)
        .get('/users/me/devices')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);
      expect(res.body).toHaveLength(0);
    });

    it("SECURITY: cannot delete another user's device by guessing its id", async () => {
      const victim = await signup(server, { name: 'Victim' });
      const attacker = await signup(server, { name: 'Attacker' });

      const device = await request(server)
        .post('/users/me/devices')
        .set('Authorization', `Bearer ${victim.accessToken}`)
        .send({ name: "Victim's rig", model: 'iPhone 15' })
        .expect(201);

      await request(server)
        .delete(`/users/me/devices/${device.body.id}`)
        .set('Authorization', `Bearer ${attacker.accessToken}`)
        .expect(404);

      const stillThere = await request(server)
        .get('/users/me/devices')
        .set('Authorization', `Bearer ${victim.accessToken}`)
        .expect(200);
      expect(stillThere.body).toHaveLength(1);
    });
  });

  describe('PATCH /users/me/push-token', () => {
    it('accepts a token', async () => {
      const user = await signup(server);
      await request(server)
        .patch('/users/me/push-token')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ token: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
        .expect(200);
    });

    it('rejects an empty token', async () => {
      const user = await signup(server);
      await request(server)
        .patch('/users/me/push-token')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ token: '' })
        .expect(400);
    });
  });

  describe('GET /users/:id/profile (member profile)', () => {
    it('requires authentication', async () => {
      const someone = await signup(server);
      await request(server).get(`/users/${someone.user.id}/profile`).expect(401);
    });

    it('lets a user view their own profile via this route even with no org yet', async () => {
      const user = await signup(server);
      const res = await request(server)
        .get(`/users/${user.user.id}/profile`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);
      expect(res.body.id).toBe(user.user.id);
    });

    it('lets org members view each other, both directions', async () => {
      const coach = await signup(server, { name: 'Coach' });
      const org = await createOrgAs(server, coach.accessToken, 'COACH');
      const player = await signup(server, { name: 'Player' });
      await joinOrgAs(server, player.accessToken, org.orgCode);

      await request(server)
        .patch('/users/me')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .send({ inGameName: 'PlayerIGN', roles: ['SNIPER'] })
        .expect(200);

      const coachSeesPlayer = await request(server)
        .get(`/users/${player.user.id}/profile`)
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(200);
      expect(coachSeesPlayer.body.inGameName).toBe('PlayerIGN');

      const playerSeesCoach = await request(server)
        .get(`/users/${coach.user.id}/profile`)
        .set('Authorization', `Bearer ${player.accessToken}`)
        .expect(200);
      expect(playerSeesCoach.body.id).toBe(coach.user.id);
    });

    it('includes the viewed member\'s org role and owner status', async () => {
      const coach = await signup(server, { name: 'Coach' });
      const org = await createOrgAs(server, coach.accessToken, 'COACH');
      const player = await signup(server, { name: 'Player' });
      await joinOrgAs(server, player.accessToken, org.orgCode);

      const coachSeesPlayer = await request(server)
        .get(`/users/${player.user.id}/profile`)
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(200);
      expect(coachSeesPlayer.body.role).toBe('PLAYER');
      expect(coachSeesPlayer.body.isOwner).toBe(false);

      const playerSeesCoach = await request(server)
        .get(`/users/${coach.user.id}/profile`)
        .set('Authorization', `Bearer ${player.accessToken}`)
        .expect(200);
      expect(playerSeesCoach.body.role).toBe('COACH');
      expect(playerSeesCoach.body.isOwner).toBe(true);

      // Self-view (no org yet) carries no role.
      const outsider = await signup(server, { name: 'Outsider' });
      const ownView = await request(server)
        .get(`/users/${outsider.user.id}/profile`)
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .expect(200);
      expect(ownView.body.role).toBeNull();
      expect(ownView.body.isOwner).toBe(false);
    });

    it('SECURITY: refuses to show a profile across org boundaries (403, not the data)', async () => {
      const coachA = await signup(server, { name: 'Coach A' });
      const orgA = await createOrgAs(server, coachA.accessToken, 'COACH');
      const playerA = await signup(server, { name: 'Player A' });
      await joinOrgAs(server, playerA.accessToken, orgA.orgCode);
      await request(server)
        .patch('/users/me')
        .set('Authorization', `Bearer ${playerA.accessToken}`)
        .send({ inGameName: 'SecretIGN' })
        .expect(200);

      const outsider = await signup(server, { name: 'Outsider' });
      const res = await request(server)
        .get(`/users/${playerA.user.id}/profile`)
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .expect(403);
      expect(JSON.stringify(res.body)).not.toMatch(/SecretIGN/);
    });

    it('never leaks passwordHash/email on a teammate profile either', async () => {
      const coach = await signup(server, { name: 'Coach' });
      const org = await createOrgAs(server, coach.accessToken, 'COACH');
      const player = await signup(server, { name: 'Player' });
      await joinOrgAs(server, player.accessToken, org.orgCode);

      const res = await request(server)
        .get(`/users/${player.user.id}/profile`)
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(200);
      const keys = Object.keys(res.body);
      expect(keys).not.toContain('passwordHash');
      expect(keys).not.toContain('email');
    });
  });
});
