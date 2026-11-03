import * as request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './utils/test-app';
import { signup, createOrgAs } from './utils/fixtures';

// WebsiteTournamentRecord backs the public sacredesports.com Records tab and
// has no orgId — it's a single global table, not per-org data. Writes must
// be restricted to the one real org (PRIMARY_ORG_ID), not "coach/owner of any
// org" — otherwise anyone can sign up, create a free throwaway org, and
// deface the public site. See WebsiteService#assertCoachOrOwner.
describe('Tournament records authorization', () => {
  let app: INestApplication;
  let server: any;
  let configService: ConfigService;
  let realGet: ConfigService['get'];

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    configService = app.get(ConfigService);
    realGet = configService.get.bind(configService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  const validPayload = {
    name: 'Test Cup',
    status: 'Qualified',
    kind: 'qualified' as const,
  };

  function stubPrimaryOrgId(orgId: string | undefined) {
    jest.spyOn(configService, 'get').mockImplementation(((key: string, ...rest: any[]) => {
      if (key === 'PRIMARY_ORG_ID') return orgId;
      return (realGet as any)(key, ...rest);
    }) as any);
  }

  it('rejects a coach/owner of a non-primary org — closes the free-throwaway-org bypass', async () => {
    const { accessToken } = await signup(server);
    const org = await createOrgAs(server, accessToken, 'COACH');
    stubPrimaryOrgId('some-other-org-id-not-this-one');

    await request(server)
      .post('/tournament-records')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(validPayload)
      .expect(403);

    expect(org.id).not.toBe('some-other-org-id-not-this-one');
  });

  it('rejects everyone when PRIMARY_ORG_ID is not configured — fails closed, not open', async () => {
    const { accessToken } = await signup(server);
    await createOrgAs(server, accessToken, 'COACH');
    stubPrimaryOrgId(undefined);

    await request(server)
      .post('/tournament-records')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(validPayload)
      .expect(403);
  });

  it('allows a coach of the primary org to create, update, and delete a record', async () => {
    const { accessToken } = await signup(server);
    const org = await createOrgAs(server, accessToken, 'COACH');
    stubPrimaryOrgId(org.id);

    const created = await request(server)
      .post('/tournament-records')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(validPayload)
      .expect(201);

    await request(server)
      .patch(`/tournament-records/${created.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...validPayload, status: 'Champion' })
      .expect(200);

    await request(server)
      .delete(`/tournament-records/${created.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('keeps the public records endpoint unauthenticated regardless of PRIMARY_ORG_ID', async () => {
    stubPrimaryOrgId(undefined);
    await request(server).get('/public/tournament-records').expect(200);
  });
});
