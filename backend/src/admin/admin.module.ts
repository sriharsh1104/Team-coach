import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

// ChatModule is imported for ChatPresenceTracker alone — it is where
// "who is connected right now" actually lives, and the admin dashboard
// reads it rather than keeping a second, inevitably divergent copy.
// RealtimeModule: push directVoice.changed to the grantee so their app
// redraws the 1-on-1 entry without a logout.
@Module({
  imports: [PrismaModule, ChatModule, RealtimeModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
