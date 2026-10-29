import { Global, Module } from '@nestjs/common';
import { MembershipModule } from '../membership/membership.module';
import { RealtimeController } from './realtime.controller';
import { RealtimeService } from './realtime.service';

@Global()
@Module({
  imports: [MembershipModule],
  controllers: [RealtimeController],
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
