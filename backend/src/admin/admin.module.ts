import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

// ChatModule is imported for ChatPresenceTracker alone — it is where
// "who is connected right now" actually lives, and the admin dashboard
// reads it rather than keeping a second, inevitably divergent copy.
@Module({
  imports: [PrismaModule, ChatModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
