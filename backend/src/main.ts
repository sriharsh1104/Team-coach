import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

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
