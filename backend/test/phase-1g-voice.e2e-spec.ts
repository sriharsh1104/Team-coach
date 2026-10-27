import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { Socket } from 'socket.io-client';
import {
  createTestApp,
  getPrisma,
  resetDatabase,
  listenOnEphemeralPort,
} from './utils/test-app';
import { signup, createOrgAs, joinOrgAs } from './utils/fixtures';
import {
  connectSocket,
  connectAndExpectRejection,
  connectViaQueryTokenAndExpectRejection,
  emitAck,
  waitForEvent,
  assertNoEvent,
} from './utils/socket-helpers';
import { PrismaService } from '../src/prisma/prisma.service';

// This file tests the self-hosted mediasoup path (.env.test's
// VOICE_SELF_HOSTED=true, matching the project default) as far as it goes
// without a real WebRTC peer: real signaling, a real mediasoup worker and
// router, real ICE/DTLS parameters back from a real WebRtcTransport. It does
// not — can't, without an actual browser/device — produce or consume real
// audio. The hosted-mode (LiveKit) branch is covered separately in
// src/voice/voice.service.spec.ts as a unit test, since flipping
// VOICE_SELF_HOSTED for just part of this file would mean mutating
// process.env shared by every other e2e file in the same test run.
describe('Phase 1G — Voice (self-hosted signaling) (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let baseUrl: string;
  let prisma: PrismaService;
  const openSockets: Socket[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    baseUrl = await listenOnEphemeralPort(app);
    prisma = getPrisma(app);
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  afterEach(async () => {
    for (const socket of openSockets) socket.disconnect();
    openSockets.length = 0;
    await resetDatabase(prisma);
  });

  async function setUpOrgWithTwoPlayers() {
    const coach = await signup(server, { name: 'Coach' });
    const org = await createOrgAs(server, coach.accessToken, 'COACH');
    const player = await signup(server, { name: 'Player' });
    await joinOrgAs(server, player.accessToken, org.orgCode);
    return { coach, org, player };
  }

  describe('GET /voice/config', () => {
    it('requires authentication', async () => {
      await request(server).get('/voice/config').expect(401);
    });

    it('reports self-hosted mode, matching this test environment', async () => {
      const user = await signup(server);
      const res = await request(server)
        .get('/voice/config')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);
      expect(res.body).toEqual({ mode: 'self' });
    });
  });

  describe('WebSocket connection (/voice namespace)', () => {
    it('accepts a connection with a valid token', async () => {
      const { player } = await setUpOrgWithTwoPlayers();
      const socket = await connectSocket(baseUrl, player.accessToken, '/voice');
      openSockets.push(socket);
      expect(socket.connected).toBe(true);
    });

    it('rejects a garbage token instantly (handshake middleware, not connect-then-kick)', async () => {
      await connectAndExpectRejection(baseUrl, 'not-a-real-jwt', '/voice');
    });

    it('rejects a connection with no token at all', async () => {
      await connectAndExpectRejection(baseUrl, '', '/voice');
    });

    it('SECURITY: rejects a token sent only as a query-string param, even a valid one', async () => {
      const { player } = await setUpOrgWithTwoPlayers();
      await connectViaQueryTokenAndExpectRejection(baseUrl, player.accessToken, '/voice');
    });
  });

  describe('Signaling', () => {
    it('returns real router RTP capabilities (audio/opus) from the live mediasoup worker', async () => {
      const { player } = await setUpOrgWithTwoPlayers();
      const socket = await connectSocket(baseUrl, player.accessToken, '/voice');
      openSockets.push(socket);

      const caps = await emitAck<{ codecs: Array<{ mimeType: string }> }>(
        socket,
        'getRtpCapabilities',
      );
      expect(caps.codecs.map((c) => c.mimeType)).toContain('audio/opus');
    });

    it('creates a real WebRTC transport with genuine ICE/DTLS parameters', async () => {
      const { player } = await setUpOrgWithTwoPlayers();
      const socket = await connectSocket(baseUrl, player.accessToken, '/voice');
      openSockets.push(socket);

      const transport = await emitAck<{
        id: string;
        iceCandidates: unknown[];
        dtlsParameters: unknown;
      }>(socket, 'createTransport');
      expect(transport.id).toEqual(expect.any(String));
      expect(transport.iceCandidates.length).toBeGreaterThan(0);
      expect(transport.dtlsParameters).toBeTruthy();
    });

    it('reports no existing producers when nobody has published audio yet', async () => {
      const { player } = await setUpOrgWithTwoPlayers();
      const socket = await connectSocket(baseUrl, player.accessToken, '/voice');
      openSockets.push(socket);

      const producers = await emitAck(socket, 'getProducers');
      expect(producers).toEqual([]);
    });

    it('does not drop a signaling request sent immediately after connecting (same race as the Phase 1D chat fix, verified here too)', async () => {
      const { player } = await setUpOrgWithTwoPlayers();
      const socket = await connectSocket(baseUrl, player.accessToken, '/voice');
      openSockets.push(socket);
      // No artificial delay — if auth/org-lookup/room-join hadn't finished
      // before this fires, the handler would read an empty client.data and
      // throw or hang. The fix lives in afterInit()'s handshake middleware.
      const caps = await emitAck(socket, 'getRtpCapabilities');
      expect(caps).toBeTruthy();
    });
  });

  describe('Disconnect notifications', () => {
    it('notifies the rest of the org when a peer disconnects', async () => {
      const { coach, player } = await setUpOrgWithTwoPlayers();
      const coachSocket = await connectSocket(baseUrl, coach.accessToken, '/voice');
      const playerSocket = await connectSocket(baseUrl, player.accessToken, '/voice');
      openSockets.push(coachSocket);

      const peerLeft = waitForEvent<{ userId: string }>(coachSocket, 'peerLeft');
      playerSocket.disconnect();
      const payload = await peerLeft;
      expect(payload.userId).toBe(player.user.id);
    });

    it("SECURITY: never notifies a different org's sockets about a disconnect", async () => {
      const { player: playerA } = await setUpOrgWithTwoPlayers();
      const { player: playerB } = await setUpOrgWithTwoPlayers();

      const socketA = await connectSocket(baseUrl, playerA.accessToken, '/voice');
      const socketB = await connectSocket(baseUrl, playerB.accessToken, '/voice');
      openSockets.push(socketB);

      const bShouldNotHear = assertNoEvent(socketB, 'peerLeft');
      socketA.disconnect();
      await bShouldNotHear;
    });
  });
});
