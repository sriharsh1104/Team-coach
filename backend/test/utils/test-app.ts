import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { rm } from 'fs/promises';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

// Mirrors src/main.ts's bootstrap so e2e tests see exactly what production does.
export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<NestExpressApplication>();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useStaticAssets(
    join(process.cwd(), process.env.MEDIA_UPLOAD_DIR ?? 'uploads_test'),
    { prefix: '/media-files/' },
  );

  await app.init();
  return app;
}

export function getPrisma(app: INestApplication): PrismaService {
  return app.get(PrismaService);
}

// Supertest can inject HTTP requests without a bound port, but a real
// socket.io-client needs an actual listening server for the WebSocket
// upgrade handshake — so tests that touch a gateway (chat, voice) use this
// instead of plain createTestApp().
export async function listenOnEphemeralPort(
  app: INestApplication,
): Promise<string> {
  await app.listen(0);
  const address = app.getHttpServer().address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return `http://localhost:${port}`;
}

// Wipes everything between test files. TRUNCATE ... CASCADE on the two root
// tables clears every row that has a foreign key pointing at them (Postgres
// cascades the truncate itself, independent of Prisma's own onDelete setting).
export async function resetDatabase(prisma: PrismaService) {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "User", "Org" RESTART IDENTITY CASCADE;`,
  );
}

// Any test that uploads media (Phase 1C, 1F) writes real files under
// uploads_test/ — call this in afterAll so repeated runs don't accumulate
// junk. Safe to call from multiple spec files; each just clears what's there.
export async function cleanUploadsDir() {
  await rm(join(process.cwd(), process.env.MEDIA_UPLOAD_DIR ?? 'uploads_test'), {
    recursive: true,
    force: true,
  });
}

let emailCounter = 0;
export function uniqueEmail(prefix: string): string {
  emailCounter += 1;
  return `${prefix}-${Date.now()}-${emailCounter}@example.com`;
}
