import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PushNotificationService } from '../common/push-notification.service';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';

@Module({
  imports: [PrismaModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService, PushNotificationService],
})
export class AnnouncementsModule {}
