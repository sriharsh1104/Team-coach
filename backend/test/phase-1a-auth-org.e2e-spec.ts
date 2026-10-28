import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as speakeasy from 'speakeasy';
import { createTestApp, getPrisma, resetDatabase, uniqueEmail } from './utils/test-app';
import { sentOtps } from './utils/mailer-mock';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Phase 1A — Auth + Org (e2e)', () => {
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

  async function signup(overrides: Partial<{ email: string; password: string; name: string }> = {}) {
    const body = {
      email: overrides.email ?? uniqueEmail('user'),
      password: overrides.password ?? 'Password123!',
      name: overrides.name ?? 'Test User',
    };
    const signupRes = await request(server).post('/auth/signup').send(body).expect(201);
    const code = sentOtps.get(body.email);
    const res = await request(server)
      .post('/auth/verify-email')
      .send({ challengeToken: signupRes.body.challengeToken, code })
      .expect(201);
    return { ...res.body, email: body.email, password: body.password };
  }

  async function createOrgAs(
    token: string,
    role: 'PLAYER' | 'COACH' | 'ANALYST' = 'COACH',
  ) {
    const res = await request(server)
      .post('/orgs')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Org', role })
      .expect(201);
    return res.body;
  }

  describe('POST /auth/signup', () => {
    it('creates a user and returns a usable access token', async () => {
      const user = await signup();
      expect(user.accessToken).toEqual(expect.any(String));
      expect(user.user.email).toBeDefined();
      expect(user.org).toBeNull();
    });

    it('never returns the password hash in the response', async () => {
      const user = await signup();
      expect(JSON.stringify(user)).not.toMatch(/passwordHash/i);
      expect(user.user.passwordHash).toBeUndefined();
    });

    it('profileComplete is false for a brand new user until IGN/UID/phone are all set', async () => {
      const user = await signup();
      expect(user.user.profileComplete).toBe(false);

      await request(server)
        .patch('/users/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ inGameName: 'ShadowStrike', inGameUid: 'UID-1' })
        .expect(200);
      let me = await request(server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);
      expect(me.body.profileComplete).toBe(false);

      await request(server)
        .patch('/users/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ phone: '9999999999' })
        .expect(200);
      me = await request(server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);
      expect(me.body.profileComplete).toBe(true);
    });

    it('rejects a duplicate email with 409, not a generic 500', async () => {
      const email = uniqueEmail('dup');
      await signup({ email });
      await request(server)
        .post('/auth/signup')
        .send({ email, password: 'Password123!', name: 'Second' })
        .expect(409);
    });

    it('rejects an invalid email format', async () => {
      await request(server)
        .post('/auth/signup')
        .send({ email: 'not-an-email', password: 'Password123!', name: 'X' })
        .expect(400);
    });

    it('rejects a password shorter than 8 characters', async () => {
      await request(server)
        .post('/auth/signup')
        .send({ email: uniqueEmail('short'), password: 'abc123', name: 'X' })
        .expect(400);
    });

    it('rejects unexpected extra fields instead of silently accepting them (mass-assignment guard)', async () => {
      // forbidNonWhitelisted should 400 this, not quietly ignore `isAdmin`/`id`.
      await request(server)
        .post('/auth/signup')
        .send({
          email: uniqueEmail('mass'),
          password: 'Password123!',
          name: 'X',
          isAdmin: true,
          id: 'attacker-chosen-id',
        })
        .expect(400);
    });

    it('does not crash or misbehave on SQL-injection-shaped input', async () => {
      const res = await request(server).post('/auth/signup').send({
        email: `inject${Date.now()}@example.com`,
        password: "pwd123'; DROP TABLE \"User\"; --",
        name: "Robert'); DROP TABLE Students;--",
      });
      // Either validated away or accepted as a literal string — never a 500.
      expect([201, 400]).toContain(res.status);

      const stillWorks = await request(server).post('/auth/signup').send({
        email: uniqueEmail('after-injection'),
        password: 'Password123!',
        name: 'Still Works',
      });
      expect(stillWorks.status).toBe(201);
    });
  });

  describe('Email verification (signup OTP)', () => {
    async function rawSignup(overrides: Partial<{ email: string; password: string; name: string }> = {}) {
      const body = {
        email: overrides.email ?? uniqueEmail('verify'),
        password: overrides.password ?? 'Password123!',
        name: overrides.name ?? 'Verify Me',
      };
      const res = await request(server).post('/auth/signup').send(body).expect(201);
      return { ...body, challengeToken: res.body.challengeToken };
    }

    it('signup returns a challenge, not a usable session', async () => {
      const res = await request(server).post('/auth/signup').send({
        email: uniqueEmail('nosession'),
        password: 'Password123!',
        name: 'No Session',
      });
      expect(res.body.requiresEmailVerification).toBe(true);
      expect(res.body.challengeToken).toEqual(expect.any(String));
      expect(res.body.accessToken).toBeUndefined();
    });

    it('verifying the correct code logs the user in', async () => {
      const { email, challengeToken } = await rawSignup();
      const code = sentOtps.get(email);

      const res = await request(server)
        .post('/auth/verify-email')
        .send({ challengeToken, code })
        .expect(201);

      expect(res.body.accessToken).toEqual(expect.any(String));
      await request(server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);
    });

    it('rejects an incorrect code without granting a session', async () => {
      const { challengeToken } = await rawSignup();

      const res = await request(server)
        .post('/auth/verify-email')
        .send({ challengeToken, code: '000000' })
        .expect(401);
      expect(res.body.accessToken).toBeUndefined();
    });

    it('rejects a code for a challenge that has expired', async () => {
      const { email, challengeToken } = await rawSignup();
      const code = sentOtps.get(email);
      await prisma.emailVerificationCode.updateMany({
        where: { user: { email } },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await request(server)
        .post('/auth/verify-email')
        .send({ challengeToken, code })
        .expect(401);
    });

    it('resend issues a fresh working code', async () => {
      const { email, challengeToken } = await rawSignup();
      const firstCode = sentOtps.get(email);

      await request(server)
        .post('/auth/resend-verification')
        .send({ challengeToken })
        .expect(201);
      const secondCode = sentOtps.get(email);
      expect(secondCode).toEqual(expect.any(String));

      // The old code is no longer valid — only the resent one is.
      if (firstCode !== secondCode) {
        await request(server)
          .post('/auth/verify-email')
          .send({ challengeToken, code: firstCode })
          .expect(401);
      }
      await request(server)
        .post('/auth/verify-email')
        .send({ challengeToken, code: secondCode })
        .expect(201);
    });
  });

  describe('POST /auth/login', () => {
    it('logs in with correct credentials', async () => {
      const { email, password } = await signup();
      // 201, not 200 — Nest's default for any @Post() handler without an
      // explicit @HttpCode(), and consistent with every other POST in this app.
      const res = await request(server).post('/auth/login').send({ email, password }).expect(201);
      expect(res.body.accessToken).toEqual(expect.any(String));
    });

    it('rejects a wrong password with 401', async () => {
      const { email } = await signup();
      await request(server)
        .post('/auth/login')
        .send({ email, password: 'wrong-password' })
        .expect(401);
    });

    it('gives the same error for a wrong password and a nonexistent email (no user enumeration)', async () => {
      const { email } = await signup();
      const wrongPassword = await request(server)
        .post('/auth/login')
        .send({ email, password: 'wrong-password' });
      const noSuchUser = await request(server)
        .post('/auth/login')
        .send({ email: uniqueEmail('nosuch'), password: 'whatever123' });

      expect(wrongPassword.status).toBe(noSuchUser.status);
      expect(wrongPassword.body.message).toBe(noSuchUser.body.message);
    });
  });

  describe('POST /auth/google', () => {
    it('rejects a garbage idToken instead of crashing', async () => {
      const res = await request(server)
        .post('/auth/google')
        .send({ idToken: 'not-a-real-google-token' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects a missing idToken with validation error', async () => {
      await request(server).post('/auth/google').send({}).expect(400);
    });
  });

  describe('GET /auth/me', () => {
    it('requires authentication', async () => {
      await request(server).get('/auth/me').expect(401);
    });

    it('rejects a malformed token', async () => {
      await request(server)
        .get('/auth/me')
        .set('Authorization', 'Bearer not-a-real-jwt')
        .expect(401);
    });

    it('returns the correct user for a valid token', async () => {
      const user = await signup({ name: 'Alice' });
      const res = await request(server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);
      expect(res.body.name).toBe('Alice');
      expect(res.body.org).toBeNull();
      expect(res.body.profileComplete).toBe(false);
    });
  });

  describe('POST /auth/logout', () => {
    it('requires authentication', async () => {
      await request(server).post('/auth/logout').expect(401);
    });

    it('SECURITY: invalidates the token that was used to log out — it can no longer authenticate anything', async () => {
      const user = await signup({ name: 'Alice' });

      await request(server)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(201);

      await request(server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(401);
    });

    it('does not affect a fresh token obtained by logging in again afterwards', async () => {
      const user = await signup({ name: 'Alice' });
      await request(server)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(201);

      const relogin = await request(server)
        .post('/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(201);

      await request(server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${relogin.body.accessToken}`)
        .expect(200);
    });
  });

  describe('Org create/join', () => {
    it('creates an org and returns a code and referral link', async () => {
      const coach = await signup();
      const org = await createOrgAs(coach.accessToken, 'COACH');
      expect(org.orgCode).toMatch(/^[A-Z0-9]{6}$/);
      expect(org.referralLink).toEqual(expect.any(String));
      expect(org.myRole).toBe('COACH');
    });

    it('refuses to let a user create a second org once they already belong to one', async () => {
      const coach = await signup();
      await createOrgAs(coach.accessToken);
      await request(server)
        .post('/orgs')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .send({ name: 'Another Org', role: 'COACH' })
        .expect(409);
    });

    it('lets a player join by org code as PLAYER', async () => {
      const coach = await signup();
      const org = await createOrgAs(coach.accessToken);
      const player = await signup();

      const res = await request(server)
        .post('/orgs/join')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .send({ orgCode: org.orgCode })
        .expect(201);
      expect(res.body.id).toBe(org.id);
      expect(res.body.myRole).toBe('PLAYER');
    });

    it('lets a player join by referral link token', async () => {
      const coach = await signup();
      const org = await createOrgAs(coach.accessToken);
      const player = await signup();

      await request(server)
        .post('/orgs/join')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .send({ referralToken: org.referralLink })
        .expect(201);
    });

    it('404s on an unknown org code rather than leaking anything', async () => {
      const player = await signup();
      await request(server)
        .post('/orgs/join')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .send({ orgCode: 'ZZZZZZ' })
        .expect(404);
    });

    it('rejects a role field on join — elevated roles are owner-assigned only', async () => {
      const coach = await signup();
      const org = await createOrgAs(coach.accessToken);
      const sneaky = await signup();

      // forbidNonWhitelisted on the global ValidationPipe — sending `role`
      // must 400, not silently create a coach.
      await request(server)
        .post('/orgs/join')
        .set('Authorization', `Bearer ${sneaky.accessToken}`)
        .send({ orgCode: org.orgCode, role: 'COACH' })
        .expect(400);
    });

    it('always admits joiners as PLAYER even if the body omits role', async () => {
      const coach = await signup();
      const org = await createOrgAs(coach.accessToken);
      const joiner = await signup();

      const res = await request(server)
        .post('/orgs/join')
        .set('Authorization', `Bearer ${joiner.accessToken}`)
        .send({ orgCode: org.orgCode })
        .expect(201);
      expect(res.body.myRole).toBe('PLAYER');
      expect(res.body.isOwner).toBe(false);
    });

    it('enforces the 5-player cap', async () => {
      // 6 signups worth of real bcrypt hashing, well past Jest's 5s default.
      const coach = await signup();
      const org = await createOrgAs(coach.accessToken);

      for (let i = 0; i < 5; i++) {
        const player = await signup();
        await request(server)
          .post('/orgs/join')
          .set('Authorization', `Bearer ${player.accessToken}`)
          .send({ orgCode: org.orgCode })
          .expect(201);
      }

      const sixthPlayer = await signup();
      await request(server)
        .post('/orgs/join')
        .set('Authorization', `Bearer ${sixthPlayer.accessToken}`)
        .send({ orgCode: org.orgCode })
        .expect(409);
    }, 20000);

    it('lets the owner promote members to COACH / ANALYST, capped at 2 / 1', async () => {
      const owner = await signup();
      const org = await createOrgAs(owner.accessToken, 'COACH');

      const second = await signup();
      await request(server)
        .post('/orgs/join')
        .set('Authorization', `Bearer ${second.accessToken}`)
        .send({ orgCode: org.orgCode })
        .expect(201);

      await request(server)
        .patch('/orgs/members/role')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ targetUserId: second.user.id, role: 'COACH' })
        .expect(200);

      const third = await signup();
      await request(server)
        .post('/orgs/join')
        .set('Authorization', `Bearer ${third.accessToken}`)
        .send({ orgCode: org.orgCode })
        .expect(201);

      await request(server)
        .patch('/orgs/members/role')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ targetUserId: third.user.id, role: 'COACH' })
        .expect(409);

      const analyst = await signup();
      await request(server)
        .post('/orgs/join')
        .set('Authorization', `Bearer ${analyst.accessToken}`)
        .send({ orgCode: org.orgCode })
        .expect(201);

      await request(server)
        .patch('/orgs/members/role')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ targetUserId: analyst.user.id, role: 'ANALYST' })
        .expect(200);

      const secondAnalyst = await signup();
      await request(server)
        .post('/orgs/join')
        .set('Authorization', `Bearer ${secondAnalyst.accessToken}`)
        .send({ orgCode: org.orgCode })
        .expect(201);

      await request(server)
        .patch('/orgs/members/role')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ targetUserId: secondAnalyst.user.id, role: 'ANALYST' })
        .expect(409);
    }, 30000);

    it('forbids non-owners from changing member roles', async () => {
      const owner = await signup();
      const org = await createOrgAs(owner.accessToken);
      const player = await signup();
      await request(server)
        .post('/orgs/join')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .send({ orgCode: org.orgCode })
        .expect(201);

      await request(server)
        .patch('/orgs/members/role')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .send({ targetUserId: owner.user.id, role: 'PLAYER' })
        .expect(403);
    });

    it('the org creator is always the owner, regardless of which functional role they pick', async () => {
      const player = await signup();
      const org = await createOrgAs(player.accessToken, 'PLAYER');
      expect(org.myRole).toBe('PLAYER');
      expect(org.isOwner).toBe(true);
    });

    it('a joiner is never automatically made the owner', async () => {
      const coach = await signup();
      const org = await createOrgAs(coach.accessToken);
      const player = await signup();

      const res = await request(server)
        .post('/orgs/join')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .send({ orgCode: org.orgCode })
        .expect(201);
      expect(res.body.isOwner).toBe(false);
    });

    it('requires authentication to view the org roster', async () => {
      await request(server).get('/orgs/me').expect(401);
    });

    it('404s for a user not yet in any org, never another org\'s data', async () => {
      const outsider = await signup();
      await request(server)
        .get('/orgs/me')
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .expect(404);
    });

    it('roster flags isOwner on exactly the creator, false for everyone else', async () => {
      const coach = await signup();
      const org = await createOrgAs(coach.accessToken);
      const player = await signup();
      await request(server)
        .post('/orgs/join')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .send({ orgCode: org.orgCode })
        .expect(201);

      const res = await request(server)
        .get('/orgs/me')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(200);

      const coachMember = res.body.members.find((m: any) => m.userId === coach.user.id);
      const playerMember = res.body.members.find((m: any) => m.userId === player.user.id);
      expect(coachMember.isOwner).toBe(true);
      expect(playerMember.isOwner).toBe(false);
    });

    it('roster includes each member\'s in-game role tags alongside their org role', async () => {
      const coach = await signup();
      const org = await createOrgAs(coach.accessToken);
      const player = await signup();
      await request(server)
        .post('/orgs/join')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .send({ orgCode: org.orgCode })
        .expect(201);
      await request(server)
        .patch('/users/me')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .send({ roles: ['SNIPER', 'IGL'] })
        .expect(200);

      const res = await request(server)
        .get('/orgs/me')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .expect(200);

      const coachMember = res.body.members.find((m: any) => m.userId === coach.user.id);
      const playerMember = res.body.members.find((m: any) => m.userId === player.user.id);
      expect(coachMember.inGameRoles).toEqual([]);
      expect(playerMember.inGameRoles).toEqual(['SNIPER', 'IGL']);
    });
  });

  describe('POST /orgs/transfer-ownership', () => {
    it('requires authentication', async () => {
      await request(server).post('/orgs/transfer-ownership').send({ targetUserId: 'x' }).expect(401);
    });

    it('transfers ownership from the current owner to a teammate', async () => {
      const coach = await signup();
      const org = await createOrgAs(coach.accessToken);
      const player = await signup();
      await request(server)
        .post('/orgs/join')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .send({ orgCode: org.orgCode })
        .expect(201);

      await request(server)
        .post('/orgs/transfer-ownership')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .send({ targetUserId: player.user.id })
        .expect(201);

      const roster = await request(server)
        .get('/orgs/me')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .expect(200);
      const coachMember = roster.body.members.find((m: any) => m.userId === coach.user.id);
      const playerMember = roster.body.members.find((m: any) => m.userId === player.user.id);
      expect(coachMember.isOwner).toBe(false);
      expect(playerMember.isOwner).toBe(true);
      // The old owner's own role is untouched by the transfer — only isOwner moves.
      expect(coachMember.role).toBe('COACH');
    });

    it('SECURITY: refuses to let a non-owner transfer ownership', async () => {
      const coach = await signup();
      const org = await createOrgAs(coach.accessToken);
      const player = await signup();
      await request(server)
        .post('/orgs/join')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .send({ orgCode: org.orgCode })
        .expect(201);

      await request(server)
        .post('/orgs/transfer-ownership')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .send({ targetUserId: coach.user.id })
        .expect(403);
    });

    it('404s (not 403) when the target is not a member of your org, never confirming who is in another org', async () => {
      const coach = await signup();
      await createOrgAs(coach.accessToken);
      const outsider = await signup();

      await request(server)
        .post('/orgs/transfer-ownership')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .send({ targetUserId: outsider.user.id })
        .expect(404);
    });

    it('rejects transferring ownership to yourself', async () => {
      const coach = await signup();
      await createOrgAs(coach.accessToken);

      await request(server)
        .post('/orgs/transfer-ownership')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .send({ targetUserId: coach.user.id })
        .expect(400);
    });

    it('404s for a caller not in any org', async () => {
      const outsider = await signup();
      await request(server)
        .post('/orgs/transfer-ownership')
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .send({ targetUserId: 'whoever' })
        .expect(404);
    });
  });

  describe('PATCH /orgs/members/role', () => {
    it('requires authentication', async () => {
      await request(server)
        .patch('/orgs/members/role')
        .send({ targetUserId: 'x', role: 'COACH' })
        .expect(401);
    });

    it('lets the owner promote a player to coach', async () => {
      const owner = await signup();
      const org = await createOrgAs(owner.accessToken);
      const player = await signup();
      await request(server)
        .post('/orgs/join')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .send({ orgCode: org.orgCode })
        .expect(201);

      const res = await request(server)
        .patch('/orgs/members/role')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ targetUserId: player.user.id, role: 'COACH' })
        .expect(200);
      expect(res.body.role).toBe('COACH');

      const roster = await request(server)
        .get('/orgs/me')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      const playerMember = roster.body.members.find((m: any) => m.userId === player.user.id);
      expect(playerMember.role).toBe('COACH');
    });

    it('SECURITY: refuses a non-owner (even a coach) from changing roles', async () => {
      const owner = await signup();
      const org = await createOrgAs(owner.accessToken);
      const coach = await signup();
      await request(server)
        .post('/orgs/join')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .send({ orgCode: org.orgCode })
        .expect(201);
      await request(server)
        .patch('/orgs/members/role')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ targetUserId: coach.user.id, role: 'COACH' })
        .expect(200);
      const player = await signup();
      await request(server)
        .post('/orgs/join')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .send({ orgCode: org.orgCode })
        .expect(201);

      await request(server)
        .patch('/orgs/members/role')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .send({ targetUserId: player.user.id, role: 'ANALYST' })
        .expect(403);
    });

    it('enforces the role cap when promoting (max 2 coaches)', async () => {
      const owner = await signup();
      const org = await createOrgAs(owner.accessToken, 'COACH');
      const coach2 = await signup();
      await request(server)
        .post('/orgs/join')
        .set('Authorization', `Bearer ${coach2.accessToken}`)
        .send({ orgCode: org.orgCode })
        .expect(201);
      await request(server)
        .patch('/orgs/members/role')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ targetUserId: coach2.user.id, role: 'COACH' })
        .expect(200);

      const thirdPlayer = await signup();
      await request(server)
        .post('/orgs/join')
        .set('Authorization', `Bearer ${thirdPlayer.accessToken}`)
        .send({ orgCode: org.orgCode })
        .expect(201);

      await request(server)
        .patch('/orgs/members/role')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ targetUserId: thirdPlayer.user.id, role: 'COACH' })
        .expect(409);
    });

    it('404s when the target is not a member of your org', async () => {
      const owner = await signup();
      await createOrgAs(owner.accessToken);
      const outsider = await signup();

      await request(server)
        .patch('/orgs/members/role')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ targetUserId: outsider.user.id, role: 'COACH' })
        .expect(404);
    });
  });

  describe('POST /orgs/members/remove', () => {
    it('requires authentication', async () => {
      await request(server)
        .post('/orgs/members/remove')
        .send({ targetUserId: 'x' })
        .expect(401);
    });

    it('lets the owner remove a member, freeing up their role slot', async () => {
      const owner = await signup();
      const org = await createOrgAs(owner.accessToken);
      const player = await signup();
      await request(server)
        .post('/orgs/join')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .send({ orgCode: org.orgCode })
        .expect(201);

      await request(server)
        .post('/orgs/members/remove')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ targetUserId: player.user.id })
        .expect(201);

      const roster = await request(server)
        .get('/orgs/me')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect(roster.body.members.map((m: any) => m.userId)).not.toContain(player.user.id);

      // Removed member is no longer part of any org — can join (or a new one) again.
      await request(server)
        .get('/orgs/me')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .expect(404);
    });

    it('SECURITY: refuses a non-owner (even a coach) from removing anyone', async () => {
      const owner = await signup();
      const org = await createOrgAs(owner.accessToken);
      const coach = await signup();
      await request(server)
        .post('/orgs/join')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .send({ orgCode: org.orgCode })
        .expect(201);
      await request(server)
        .patch('/orgs/members/role')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ targetUserId: coach.user.id, role: 'COACH' })
        .expect(200);
      const player = await signup();
      await request(server)
        .post('/orgs/join')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .send({ orgCode: org.orgCode })
        .expect(201);

      await request(server)
        .post('/orgs/members/remove')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .send({ targetUserId: player.user.id })
        .expect(403);
    });

    it('rejects removing yourself', async () => {
      const owner = await signup();
      await createOrgAs(owner.accessToken);

      await request(server)
        .post('/orgs/members/remove')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ targetUserId: owner.user.id })
        .expect(400);
    });

    it("404s (not 403) when the target is not a member of your org — doesn't confirm who's in another org", async () => {
      const owner = await signup();
      await createOrgAs(owner.accessToken);
      const outsider = await signup();

      await request(server)
        .post('/orgs/members/remove')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ targetUserId: outsider.user.id })
        .expect(404);
    });

    it('404s for a caller not in any org', async () => {
      const outsider = await signup();
      await request(server)
        .post('/orgs/members/remove')
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .send({ targetUserId: 'whoever' })
        .expect(404);
    });
  });

  describe('PATCH /orgs/settings', () => {
    it('requires authentication', async () => {
      await request(server)
        .patch('/orgs/settings')
        .send({ historyVisibleToNewMembers: false })
        .expect(401);
    });

    it('lets the owner flip historyVisibleToNewMembers, reflected on GET /orgs/me', async () => {
      const owner = await signup();
      await createOrgAs(owner.accessToken);

      await request(server)
        .patch('/orgs/settings')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ historyVisibleToNewMembers: false })
        .expect(200);

      const res = await request(server)
        .get('/orgs/me')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect(res.body.historyVisibleToNewMembers).toBe(false);
    });

    it('defaults to true for a brand new org', async () => {
      const owner = await signup();
      await createOrgAs(owner.accessToken);

      const res = await request(server)
        .get('/orgs/me')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect(res.body.historyVisibleToNewMembers).toBe(true);
    });

    it('SECURITY: refuses a non-owner, even a coach', async () => {
      const owner = await signup();
      const org = await createOrgAs(owner.accessToken);
      const coach = await signup();
      await request(server)
        .post('/orgs/join')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .send({ orgCode: org.orgCode })
        .expect(201);
      await request(server)
        .patch('/orgs/members/role')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ targetUserId: coach.user.id, role: 'COACH' })
        .expect(200);

      await request(server)
        .patch('/orgs/settings')
        .set('Authorization', `Bearer ${coach.accessToken}`)
        .send({ historyVisibleToNewMembers: false })
        .expect(403);
    });

    it('404s for a caller not in any org', async () => {
      const outsider = await signup();
      await request(server)
        .patch('/orgs/settings')
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .send({ historyVisibleToNewMembers: false })
        .expect(404);
    });
  });

  describe('PATCH /auth/password', () => {
    it('requires authentication', async () => {
      await request(server)
        .patch('/auth/password')
        .send({ currentPassword: 'Password123!', newPassword: 'newpassword123' })
        .expect(401);
    });

    it('rejects the wrong current password', async () => {
      const user = await signup({ password: 'Password123!' });
      await request(server)
        .patch('/auth/password')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ currentPassword: 'wrong-password', newPassword: 'newpassword123' })
        .expect(401);
    });

    it('rejects a new password shorter than 8 characters', async () => {
      const user = await signup({ password: 'Password123!' });
      await request(server)
        .patch('/auth/password')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ currentPassword: 'Password123!', newPassword: 'short' })
        .expect(400);
    });

    it('changes the password, invalidates the old session token, and returns a fresh working one', async () => {
      const user = await signup({ email: 'changeme@example.com', password: 'Password123!' });

      const res = await request(server)
        .patch('/auth/password')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ currentPassword: 'Password123!', newPassword: 'newpassword123' })
        .expect(200);
      const freshToken = res.body.accessToken;
      expect(freshToken).toEqual(expect.any(String));

      // The OLD token (from signup) is now invalid — tokenVersion bumped.
      await request(server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(401);

      // The FRESH token from the response still works.
      await request(server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${freshToken}`)
        .expect(200);

      // The old password no longer logs in; the new one does.
      await request(server)
        .post('/auth/login')
        .send({ email: 'changeme@example.com', password: 'Password123!' })
        .expect(401);
      await request(server)
        .post('/auth/login')
        .send({ email: 'changeme@example.com', password: 'newpassword123' })
        .expect(201);
    });

    it('rejects changing the password on a Google-only account (no password set)', async () => {
      // Signing up for real via Google requires mocking the OAuth client;
      // a Google-only account is just a User row with passwordHash: null —
      // simulate that directly via a real signup, then strip the hash,
      // exactly as a Google-only account looks in the database.
      const user = await signup({ password: 'Password123!' });
      await prisma.user.update({
        where: { id: user.user.id },
        data: { passwordHash: null, googleId: `google-${user.user.id}` },
      });

      await request(server)
        .patch('/auth/password')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ currentPassword: 'Password123!', newPassword: 'newpassword123' })
        .expect(400);
    });
  });

  describe('Two-factor authentication', () => {
    async function signupAndGetSecret() {
      const user = await signup();
      const setup = await request(server)
        .post('/auth/2fa/setup')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(201);
      return { user, secret: setup.body.secret, qrCodeDataUrl: setup.body.qrCodeDataUrl };
    }

    function codeFor(secret: string) {
      return speakeasy.totp({ secret, encoding: 'base32' });
    }

    it('POST /auth/2fa/setup requires authentication and returns a secret + QR code', async () => {
      await request(server).post('/auth/2fa/setup').expect(401);

      const { secret, qrCodeDataUrl } = await signupAndGetSecret();
      expect(secret).toEqual(expect.any(String));
      expect(qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('POST /auth/2fa/enable rejects a wrong code and accepts a valid one, returning backup codes once', async () => {
      const { user, secret } = await signupAndGetSecret();

      await request(server)
        .post('/auth/2fa/enable')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ code: '000000' })
        .expect(401);

      const res = await request(server)
        .post('/auth/2fa/enable')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ code: codeFor(secret) })
        .expect(201);
      expect(res.body.backupCodes).toHaveLength(8);

      const me = await request(server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);
      expect(me.body.twoFactorEnabled).toBe(true);
    });

    it('login returns requiresTwoFactor + a challengeToken once 2FA is enabled, instead of a session token', async () => {
      const { user, secret } = await signupAndGetSecret();
      await request(server)
        .post('/auth/2fa/enable')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ code: codeFor(secret) })
        .expect(201);

      const res = await request(server)
        .post('/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(201);
      expect(res.body.requiresTwoFactor).toBe(true);
      expect(res.body.challengeToken).toEqual(expect.any(String));
      expect(res.body.accessToken).toBeUndefined();
    });

    it('POST /auth/2fa/verify completes login with a valid code, rejects a bad one', async () => {
      const { user, secret } = await signupAndGetSecret();
      await request(server)
        .post('/auth/2fa/enable')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ code: codeFor(secret) })
        .expect(201);
      const login = await request(server)
        .post('/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(201);
      const { challengeToken } = login.body;

      await request(server)
        .post('/auth/2fa/verify')
        .send({ challengeToken, code: '000000' })
        .expect(401);

      const res = await request(server)
        .post('/auth/2fa/verify')
        .send({ challengeToken, code: codeFor(secret) })
        .expect(201);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user.id).toBe(user.user.id);
    });

    it('a backup code logs in once, then is rejected on a second attempt', async () => {
      const { user, secret } = await signupAndGetSecret();
      const enable = await request(server)
        .post('/auth/2fa/enable')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ code: codeFor(secret) })
        .expect(201);
      const backupCode = enable.body.backupCodes[0];

      const login = await request(server)
        .post('/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(201);
      const { challengeToken } = login.body;

      await request(server)
        .post('/auth/2fa/verify')
        .send({ challengeToken, backupCode })
        .expect(201);

      // Second login attempt, same backup code — already consumed.
      const login2 = await request(server)
        .post('/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(201);
      await request(server)
        .post('/auth/2fa/verify')
        .send({ challengeToken: login2.body.challengeToken, backupCode })
        .expect(401);
    }, 15000);

    it('POST /auth/2fa/disable requires the correct password, then turns 2FA off', async () => {
      const { user, secret } = await signupAndGetSecret();
      await request(server)
        .post('/auth/2fa/enable')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ code: codeFor(secret) })
        .expect(201);

      await request(server)
        .post('/auth/2fa/disable')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ password: 'wrong-password' })
        .expect(401);

      await request(server)
        .post('/auth/2fa/disable')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ password: user.password })
        .expect(201);

      const res = await request(server)
        .post('/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(201);
      expect(res.body.requiresTwoFactor).toBeUndefined();
      expect(res.body.accessToken).toEqual(expect.any(String));
    }, 15000);
  });
});
