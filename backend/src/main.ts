import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Baseline security headers (CSP, HSTS, X-Frame-Options, nosniff, ...).
  // crossOriginResourcePolicy is relaxed from helmet's 'same-origin' default
  // to 'cross-origin' — web/mobile run on a different origin than this API
  // and load media/chat files (<img>/<video> src) directly from it; the
  // default would make browsers block exactly those loads.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Trust exactly one hop (the reverse proxy/load balancer in front of this
  // app in every deployment this project documents). Without this, Express's
  // default req.ip resolves to the proxy's own address for every request,
  // which collapses the global ThrottlerGuard's per-IP rate limiting (login,
  // signup, org-join, 2FA, ...) into one shared bucket for all real clients —
  // a no-op locally, where there's no proxy and no X-Forwarded-For header to
  // trust in the first place.
  app.set('trust proxy', 1);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // '*' is fine for local/dev/stage testing, but a production deployment
  // must set CORS_ORIGIN explicitly rather than silently falling back to it.
  if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
    throw new Error('CORS_ORIGIN must be set when NODE_ENV=production');
  }
  // Invite / QR links are built from WEB_PUBLIC_URL; without it they silently
  // become http://localhost:5173/join/... on a live API.
  if (process.env.NODE_ENV === 'production' && !process.env.WEB_PUBLIC_URL?.trim()) {
    throw new Error('WEB_PUBLIC_URL must be set when NODE_ENV=production');
  }
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? '*',
  });

  // Uploaded screenshots/clips are served through a guarded route
  // (GET /media/files/:fileKey in media.controller.ts) that checks the
  // requester shares an org with the upload, not through a public static
  // mount — see that controller for the access-control logic.

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
