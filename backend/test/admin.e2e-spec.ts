import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import {
  createTestApp,
  getPrisma,
  resetDatabase,
  uniqueOrgName,
} from './utils/test-app';
import { createOrgAs, signup } from './utils/fixtures';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Platform admin is the only role that reads across org boundaries, so most
 * of this file is about the ways someone might try to award it to themselves.
 */
describe('Platform admin (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaService;
  let jwt: JwtService;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    prisma = getPrisma(app);
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  afterEach(async () => {
    await resetDatabase(prisma);
  });

  /** The only supported way in — the same thing `npm run admin:grant` does. */
  async function makeAdmin(userId: string) {
    await prisma.user.update({
      where: { id: userId },
      data: { isPlatformAdmin: true },
    });
  }

  const ADMIN_ROUTES = [
    '/admin/overview',
    '/admin/orgs',
    '/admin/admins',
    '/admin/health',
    '/admin/direct-voice',
  ];

  describe('access control', () => {
    it('rejects anonymous callers', async () => {
      for (const route of ADMIN_ROUTES) {
        await request(server).get(route).expect(401);
      }
    });

    it('rejects an ordinary signed-in user', async () => {
      const user = await signup(server);
      for (const route of ADMIN_ROUTES) {
        await request(server)
          .get(route)
          .set('Authorization', `Bearer ${user.accessToken}`)
          .expect(403);
      }
    });

    it('rejects an org owner — owning a team is not platform admin', async () => {
      const owner = await signup(server);
      await createOrgAs(server, owner.accessToken, 'COACH', uniqueOrgName());

      await request(server)
        .get('/admin/overview')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(403);
    });

    it('lets a real platform admin through', async () => {
      const admin = await signup(server);
      await makeAdmin(admin.user.id);

      const res = await request(server)
        .get('/admin/overview')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      expect(res.body).toMatchObject({ orgs: expect.any(Number) });
    });
  });

  describe('cannot be granted from the client side', () => {
    it('ignores an isPlatformAdmin claim forged into a valid JWT', async () => {
      const user = await signup(server);
      const dbUser = await prisma.user.findUniqueOrThrow({
        where: { id: user.user.id },
      });

      // Signed with the server's own secret, so it passes verification — the
      // point is that the extra claim buys nothing, because the guard reads
      // the database rather than the token.
      const forged = await jwt.signAsync({
        sub: dbUser.id,
        email: dbUser.email,
        tokenVersion: dbUser.tokenVersion,
        jti: 'forged-jti',
        isPlatformAdmin: true,
        role: 'admin',
        isAdmin: true,
      });

      await request(server)
        .get('/admin/overview')
        .set('Authorization', `Bearer ${forged}`)
        .expect(403);
    });

    it('rejects isPlatformAdmin smuggled into a profile update', async () => {
      const user = await signup(server);

      await request(server)
        .patch('/users/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ name: 'Nice Try', isPlatformAdmin: true })
        .expect(400);

      const after = await prisma.user.findUniqueOrThrow({
        where: { id: user.user.id },
      });
      expect(after.isPlatformAdmin).toBe(false);
    });

    it('rejects isPlatformAdmin smuggled into signup', async () => {
      await request(server)
        .post('/auth/signup')
        .send({
          email: 'sneaky@example.com',
          password: 'Password123!',
          name: 'Sneaky',
          isPlatformAdmin: true,
        })
        .expect(400);
    });

    it('does not expose any route that writes the flag', async () => {
      const user = await signup(server);
      const auth = `Bearer ${user.accessToken}`;

      // There is no grant endpoint by design; these must not quietly exist.
      await request(server)
        .post('/admin/admins')
        .set('Authorization', auth)
        .send({ userId: user.user.id })
        .expect(404);
      await request(server)
        .patch('/admin/admins')
        .set('Authorization', auth)
        .send({ userId: user.user.id })
        .expect(404);
    });
  });

  describe('revocation', () => {
    it('takes effect on the next request, with no need to wait out the token', async () => {
      const admin = await signup(server);
      await makeAdmin(admin.user.id);
      await request(server)
        .get('/admin/overview')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      await prisma.user.update({
        where: { id: admin.user.id },
        data: { isPlatformAdmin: false },
      });

      // Same token, still perfectly valid for ordinary use — just no longer admin.
      await request(server)
        .get('/admin/overview')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(403);
    });
  });

  describe('what an admin can see', () => {
    it('lists orgs the admin is not a member of', async () => {
      const owner = await signup(server);
      const orgName = uniqueOrgName();
      await createOrgAs(server, owner.accessToken, 'COACH', orgName);

      const admin = await signup(server);
      await makeAdmin(admin.user.id);

      const res = await request(server)
        .get('/admin/orgs')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.orgs[0]).toMatchObject({
        name: orgName,
        rosterCount: 1,
        owner: { email: owner.user.email },
      });
    });

    it('returns one org in detail, with its roster', async () => {
      const owner = await signup(server);
      const org = await createOrgAs(
        server,
        owner.accessToken,
        'COACH',
        uniqueOrgName(),
      );
      const admin = await signup(server);
      await makeAdmin(admin.user.id);

      const res = await request(server)
        .get(`/admin/orgs/${org.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      expect(res.body.roster).toHaveLength(1);
      expect(res.body.roster[0]).toMatchObject({
        email: owner.user.email,
        isOwner: true,
      });
    });

    it('counts people, not just orgs — including who is active', async () => {
      const owner = await signup(server);
      await createOrgAs(server, owner.accessToken, 'COACH', uniqueOrgName());
      const admin = await signup(server);
      await makeAdmin(admin.user.id);

      // lastSeenAt is normally stamped by the chat gateway on connect; set it
      // directly here so the window maths is what's under test, not sockets.
      await prisma.user.update({
        where: { id: owner.user.id },
        data: { lastSeenAt: new Date() },
      });

      const res = await request(server)
        .get('/admin/overview')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      expect(res.body).toMatchObject({
        users: 2,
        rosterMembers: 1,
        activeUsers24h: 1,
        activeUsers7d: 1,
        onlineNow: expect.any(Number),
        pendingJoinRequests: 0,
      });
    });

    it('does not count a user last seen long ago as active', async () => {
      const user = await signup(server);
      const admin = await signup(server);
      await makeAdmin(admin.user.id);

      await prisma.user.update({
        where: { id: user.user.id },
        data: { lastSeenAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) },
      });

      const res = await request(server)
        .get('/admin/overview')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      expect(res.body.activeUsers24h).toBe(0);
      expect(res.body.activeUsers7d).toBe(0);
      expect(res.body.activeUsers30d).toBe(0);
    });

    it('finds a guild by its owner email, not just its name', async () => {
      const owner = await signup(server);
      const orgName = uniqueOrgName();
      await createOrgAs(server, owner.accessToken, 'COACH', orgName);
      const admin = await signup(server);
      await makeAdmin(admin.user.id);

      const res = await request(server)
        .get(`/admin/orgs?search=${encodeURIComponent(owner.user.email)}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.orgs[0]).toMatchObject({ name: orgName });
    });

    it('reports backend health, with the database actually probed', async () => {
      const admin = await signup(server);
      await makeAdmin(admin.user.id);

      const res = await request(server)
        .get('/admin/health')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      // 'ok' because the database answered — the test host has no Resend or
      // Cloudinary credentials, and that must not read as an outage.
      expect(res.body.status).toBe('ok');
      expect(res.body.needsAttention).toEqual(expect.any(Number));
      expect(res.body.process).toMatchObject({
        env: 'test',
        uptimeSeconds: expect.any(Number),
      });

      const database = res.body.services.find(
        (s: { key: string }) => s.key === 'database',
      );
      expect(database).toMatchObject({ status: 'up', kind: 'live' });
      expect(database.latencyMs).toEqual(expect.any(Number));

      // Config checks must never claim to have been probed — that distinction
      // is the whole reason an admin can trust the green lights above.
      for (const check of res.body.services) {
        expect(['live', 'config']).toContain(check.kind);
        expect(['up', 'down', 'off']).toContain(check.status);
      }
    });

    it('404s on an org that does not exist', async () => {
      const admin = await signup(server);
      await makeAdmin(admin.user.id);

      await request(server)
        .get('/admin/orgs/does-not-exist')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(404);
    });

    it('caps page size so one call cannot pull the whole table', async () => {
      const admin = await signup(server);
      await makeAdmin(admin.user.id);

      await request(server)
        .get('/admin/orgs?take=5000')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(400);
    });
  });

  describe('1-on-1 voice permission', () => {
    it('is not something a non-admin can hand out', async () => {
      const user = await signup(server);

      await request(server)
        .post('/admin/direct-voice')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ email: user.user.email, enabled: true })
        .expect(403);

      const after = await prisma.user.findUniqueOrThrow({
        where: { id: user.user.id },
      });
      expect(after.canDirectVoice).toBe(false);
    });

    it('grants by email, lists the holder, and revokes again', async () => {
      const member = await signup(server);
      const admin = await signup(server);
      await makeAdmin(admin.user.id);
      const auth = `Bearer ${admin.accessToken}`;

      const granted = await request(server)
        .post('/admin/direct-voice')
        .set('Authorization', auth)
        .send({ email: member.user.email, enabled: true })
        .expect(201);
      expect(granted.body).toMatchObject({
        userId: member.user.id,
        canDirectVoice: true,
      });

      const listed = await request(server)
        .get('/admin/direct-voice')
        .set('Authorization', auth)
        .expect(200);
      expect(listed.body).toHaveLength(1);
      expect(listed.body[0]).toMatchObject({ email: member.user.email });

      await request(server)
        .post('/admin/direct-voice')
        .set('Authorization', auth)
        .send({ userId: member.user.id, enabled: false })
        .expect(201);

      const empty = await request(server)
        .get('/admin/direct-voice')
        .set('Authorization', auth)
        .expect(200);
      expect(empty.body).toHaveLength(0);
    });

    it('404s on an email nobody signed up with', async () => {
      const admin = await signup(server);
      await makeAdmin(admin.user.id);

      await request(server)
        .post('/admin/direct-voice')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ email: 'nobody-here@example.com', enabled: true })
        .expect(404);
    });

    it('groups holders by guild, because only a shared guild can actually call', async () => {
      const ownerA = await signup(server);
      const orgA = await createOrgAs(
        server,
        ownerA.accessToken,
        'COACH',
        uniqueOrgName(),
      );
      const ownerB = await signup(server);
      await createOrgAs(server, ownerB.accessToken, 'COACH', uniqueOrgName());
      const loner = await signup(server);

      const admin = await signup(server);
      await makeAdmin(admin.user.id);
      const auth = `Bearer ${admin.accessToken}`;

      for (const id of [ownerA.user.id, ownerB.user.id, loner.user.id]) {
        await request(server)
          .post('/admin/direct-voice')
          .set('Authorization', auth)
          .send({ userId: id, enabled: true })
          .expect(201);
      }

      const listed = await request(server)
        .get('/admin/direct-voice')
        .set('Authorization', auth)
        .expect(200);

      const byId = Object.fromEntries(
        listed.body.map((u: { id: string; guild: unknown }) => [u.id, u.guild]),
      );
      expect(byId[ownerA.user.id]).toMatchObject({ id: orgA.id });
      expect(byId[ownerB.user.id]).not.toBeNull();
      expect(byId[ownerA.user.id].id).not.toBe(byId[ownerB.user.id].id);
      // Granted but in no guild — the dashboard has to be able to say so.
      expect(byId[loner.user.id]).toBeNull();
    });

    it('shows the permission on the member rows of a guild, so it can be toggled there', async () => {
      const owner = await signup(server);
      const org = await createOrgAs(
        server,
        owner.accessToken,
        'COACH',
        uniqueOrgName(),
      );
      const admin = await signup(server);
      await makeAdmin(admin.user.id);
      const auth = `Bearer ${admin.accessToken}`;

      const before = await request(server)
        .get(`/admin/orgs/${org.id}`)
        .set('Authorization', auth)
        .expect(200);
      expect(before.body.roster[0].canDirectVoice).toBe(false);

      await request(server)
        .post('/admin/direct-voice')
        .set('Authorization', auth)
        .send({ userId: owner.user.id, enabled: true })
        .expect(201);

      const after = await request(server)
        .get(`/admin/orgs/${org.id}`)
        .set('Authorization', auth)
        .expect(200);
      expect(after.body.roster[0].canDirectVoice).toBe(true);
    });
  });

  describe('the flag reaches the client so it can show an entry point', () => {
    it('is false for an ordinary user and true for an admin', async () => {
      const user = await signup(server);
      const before = await request(server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);
      expect(before.body.isPlatformAdmin).toBe(false);

      await makeAdmin(user.user.id);

      const after = await request(server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);
      expect(after.body.isPlatformAdmin).toBe(true);
    });
  });
});
