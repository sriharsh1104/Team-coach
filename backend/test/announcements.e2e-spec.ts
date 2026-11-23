import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  createTestApp,
  getPrisma,
  resetDatabase,
  uniqueOrgName,
} from './utils/test-app';
import { createOrgAs, joinOrgAs, signup } from './utils/fixtures';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Announcements push to every member's phone, so the thing worth testing
 * hardest is who is allowed to set that off — and that reading stays
 * per-person and inside one org.
 */
describe('Guild announcements (e2e)', () => {
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

  const auth = (token: string) => `Bearer ${token}`;

  function post(token: string, body: Record<string, unknown>) {
    return request(server)
      .post('/announcements')
      .set('Authorization', auth(token))
      .send(body);
  }

  function list(token: string) {
    return request(server)
      .get('/announcements')
      .set('Authorization', auth(token));
  }

  /** Owner + one joined member in the same org. */
  async function orgWithMember() {
    const owner = await signup(server);
    const org = await createOrgAs(
      server,
      owner.accessToken,
      'COACH',
      uniqueOrgName(),
    );
    const member = await signup(server);
    await joinOrgAs(server, member.accessToken, org.rosterCode);
    return { owner, member, org };
  }

  describe('who may post', () => {
    it('rejects anonymous callers', async () => {
      await request(server).get('/announcements').expect(401);
      await request(server).post('/announcements').send({}).expect(401);
    });

    it('lets the owner post, and everyone in the org read it', async () => {
      const { owner, member } = await orgWithMember();

      const created = await post(owner.accessToken, {
        title: 'Scrim at 9',
        body: 'Be in voice by 8:45.',
      }).expect(201);
      expect(created.body).toMatchObject({
        title: 'Scrim at 9',
        read: true,
      });

      const seen = await list(member.accessToken).expect(200);
      expect(seen.body.total).toBe(1);
      expect(seen.body.announcements[0]).toMatchObject({
        title: 'Scrim at 9',
        body: 'Be in voice by 8:45.',
        read: false,
      });
      expect(seen.body.canPost).toBe(false);
    });

    it('refuses an ordinary member — a push to everyone is the owner’s call', async () => {
      const { member } = await orgWithMember();

      await post(member.accessToken, { title: 'Hi', body: 'Everyone' }).expect(
        403,
      );
      expect(await prisma.announcement.count()).toBe(0);
    });

    it('tells someone with no guild that they have none, rather than 500ing', async () => {
      const loner = await signup(server);
      await list(loner.accessToken).expect(404);
      await post(loner.accessToken, { title: 'Hi', body: 'There' }).expect(403);
    });

    it('rejects an empty or over-long post before it reaches the database', async () => {
      const { owner } = await orgWithMember();

      await post(owner.accessToken, { title: '', body: 'x' }).expect(400);
      await post(owner.accessToken, { title: 'x', body: '' }).expect(400);
      await post(owner.accessToken, {
        title: 'x'.repeat(121),
        body: 'ok',
      }).expect(400);
      await post(owner.accessToken, {
        title: 'ok',
        body: 'x'.repeat(4001),
      }).expect(400);
      // Nothing declared in the DTO is silently accepted either.
      await post(owner.accessToken, {
        title: 'ok',
        body: 'ok',
        orgId: 'somebody-elses-org',
      }).expect(400);
      expect(await prisma.announcement.count()).toBe(0);
    });
  });

  describe('scoping', () => {
    it('never shows one guild’s announcements to another', async () => {
      const a = await orgWithMember();
      const b = await orgWithMember();

      await post(a.owner.accessToken, {
        title: 'Only for A',
        body: 'Internal',
      }).expect(201);

      const seenByB = await list(b.member.accessToken).expect(200);
      expect(seenByB.body.total).toBe(0);
    });

    it('refuses to delete an announcement belonging to another guild', async () => {
      const a = await orgWithMember();
      const b = await orgWithMember();
      const created = await post(a.owner.accessToken, {
        title: 'A only',
        body: 'Internal',
      }).expect(201);

      // Same 404 as a made-up id: an owner must not be able to confirm that
      // some other guild's announcement exists.
      await request(server)
        .delete(`/announcements/${created.body.id}`)
        .set('Authorization', auth(b.owner.accessToken))
        .expect(404);
      await request(server)
        .delete('/announcements/does-not-exist')
        .set('Authorization', auth(b.owner.accessToken))
        .expect(404);

      expect(await prisma.announcement.count()).toBe(1);
    });

    it('lets the owner delete their own', async () => {
      const { owner } = await orgWithMember();
      const created = await post(owner.accessToken, {
        title: 'Oops',
        body: 'Wrong time',
      }).expect(201);

      await request(server)
        .delete(`/announcements/${created.body.id}`)
        .set('Authorization', auth(owner.accessToken))
        .expect(200);
      expect(await prisma.announcement.count()).toBe(0);
    });

    it('refuses a member deleting anything', async () => {
      const { owner, member } = await orgWithMember();
      const created = await post(owner.accessToken, {
        title: 'Stays',
        body: 'Put',
      }).expect(201);

      await request(server)
        .delete(`/announcements/${created.body.id}`)
        .set('Authorization', auth(member.accessToken))
        .expect(403);
      expect(await prisma.announcement.count()).toBe(1);
    });
  });

  describe('read state', () => {
    it('counts unread per person, and the author never sees their own as unread', async () => {
      const { owner, member } = await orgWithMember();
      await post(owner.accessToken, { title: 'One', body: 'First' }).expect(201);
      await post(owner.accessToken, { title: 'Two', body: 'Second' }).expect(
        201,
      );

      const ownerUnread = await request(server)
        .get('/announcements/unread')
        .set('Authorization', auth(owner.accessToken))
        .expect(200);
      expect(ownerUnread.body.unread).toBe(0);

      const memberUnread = await request(server)
        .get('/announcements/unread')
        .set('Authorization', auth(member.accessToken))
        .expect(200);
      expect(memberUnread.body.unread).toBe(2);
    });

    it('clears on open, and opening again is a no-op rather than an error', async () => {
      const { owner, member } = await orgWithMember();
      await post(owner.accessToken, { title: 'One', body: 'First' }).expect(201);

      const first = await request(server)
        .post('/announcements/read')
        .set('Authorization', auth(member.accessToken))
        .expect(201);
      expect(first.body.marked).toBe(1);

      const second = await request(server)
        .post('/announcements/read')
        .set('Authorization', auth(member.accessToken))
        .expect(201);
      expect(second.body.marked).toBe(0);

      const after = await list(member.accessToken).expect(200);
      expect(after.body.unread).toBe(0);
      expect(after.body.announcements[0].read).toBe(true);
    });

    it('does not mark one member read because another opened it', async () => {
      const owner = await signup(server);
      const org = await createOrgAs(
        server,
        owner.accessToken,
        'COACH',
        uniqueOrgName(),
      );
      const reader = await signup(server);
      const quiet = await signup(server);
      await joinOrgAs(server, reader.accessToken, org.rosterCode);
      await joinOrgAs(server, quiet.accessToken, org.rosterCode);
      await post(owner.accessToken, { title: 'One', body: 'First' }).expect(201);

      await request(server)
        .post('/announcements/read')
        .set('Authorization', auth(reader.accessToken))
        .expect(201);

      const quietList = await list(quiet.accessToken).expect(200);
      expect(quietList.body.unread).toBe(1);
      expect(quietList.body.announcements[0].read).toBe(false);
    });

    it('a post made after someone read everything is unread again', async () => {
      const { owner, member } = await orgWithMember();
      await post(owner.accessToken, { title: 'One', body: 'First' }).expect(201);
      await request(server)
        .post('/announcements/read')
        .set('Authorization', auth(member.accessToken))
        .expect(201);

      await post(owner.accessToken, { title: 'Two', body: 'Second' }).expect(
        201,
      );

      const after = await list(member.accessToken).expect(200);
      expect(after.body.unread).toBe(1);
    });
  });

  it('pages newest-first and caps the page size', async () => {
    const { owner, member } = await orgWithMember();
    for (const n of [1, 2, 3]) {
      await post(owner.accessToken, {
        title: `Post ${n}`,
        body: 'Body',
      }).expect(201);
    }

    const page = await request(server)
      .get('/announcements?take=2')
      .set('Authorization', auth(member.accessToken))
      .expect(200);
    expect(page.body.total).toBe(3);
    expect(page.body.announcements.map((a: { title: string }) => a.title)).toEqual(
      ['Post 3', 'Post 2'],
    );

    await request(server)
      .get('/announcements?take=5000')
      .set('Authorization', auth(member.accessToken))
      .expect(400);
  });
});
