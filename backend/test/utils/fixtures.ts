import * as request from 'supertest';
import { uniqueEmail } from './test-app';

export async function signup(
  server: any,
  overrides: Partial<{ email: string; password: string; name: string }> = {},
) {
  const body = {
    email: overrides.email ?? uniqueEmail('user'),
    password: overrides.password ?? 'password123',
    name: overrides.name ?? 'Test User',
  };
  const res = await request(server).post('/auth/signup').send(body).expect(201);
  return { ...res.body, email: body.email, password: body.password };
}

export async function createOrgAs(
  server: any,
  token: string,
  role: 'PLAYER' | 'COACH' | 'ANALYST' = 'COACH',
  name = 'Test Org',
) {
  const res = await request(server)
    .post('/orgs')
    .set('Authorization', `Bearer ${token}`)
    .send({ name, role })
    .expect(201);
  return res.body;
}

// Joiners are always PLAYER — elevated roles are assigned by the owner.
export async function joinOrgAs(server: any, token: string, orgCode: string) {
  const res = await request(server)
    .post('/orgs/join')
    .set('Authorization', `Bearer ${token}`)
    .send({ orgCode })
    .expect(201);
  return res.body;
}

export async function changeMemberRoleAs(
  server: any,
  ownerToken: string,
  targetUserId: string,
  role: 'PLAYER' | 'COACH' | 'ANALYST',
) {
  const res = await request(server)
    .patch('/orgs/members/role')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ targetUserId, role })
    .expect(200);
  return res.body;
}

// Minimal-but-valid JPEG — same trick as the Phase 1C suite, just shared here
// since Phase 1F's stat-extraction tests need real media posts to attach to.
export const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
  'base64',
);

export async function uploadMedia(
  server: any,
  token: string,
  type: 'IMAGE' | 'VIDEO' = 'IMAGE',
) {
  const res = await request(server)
    .post('/media')
    .set('Authorization', `Bearer ${token}`)
    .field('type', type)
    .attach('file', TINY_JPEG, { filename: 'shot.jpg', contentType: 'image/jpeg' })
    .expect(201);
  return res.body;
}
