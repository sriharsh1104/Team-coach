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

  const ADMIN_ROUTES = ['/admin/overview', '/admin/orgs', '/admin/admins'];

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
