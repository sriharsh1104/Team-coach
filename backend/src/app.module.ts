import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { OrgModule } from './org/org.module';
import { UsersModule } from './users/users.module';
import { MediaModule } from './media/media.module';
import { ChatModule } from './chat/chat.module';
import { ScrimsModule } from './scrims/scrims.module';
import { StatsModule } from './stats/stats.module';
import { VoiceModule } from './voice/voice.module';
import { RealtimeModule } from './realtime/realtime.module';
import { WebsiteModule } from './website/website.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV ?? 'development'}`,
    }),
    ThrottlerModule.forRoot([
      {
        // Generous enough for real use, tight enough to block a naive
        // brute-force script against auth/org-join. Effectively unlimited in
        // tests, which fire many requests back-to-back under --runInBand.
        ttl: 60000,
        limit: process.env.NODE_ENV === 'test' ? 100000 : 20,
      },
    ]),
    PrismaModule,
    AuthModule,
    OrgModule,
    UsersModule,
    MediaModule,
    ChatModule,
    ScrimsModule,
    StatsModule,
    VoiceModule,
    RealtimeModule,
    WebsiteModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
