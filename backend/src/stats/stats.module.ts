import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { MembershipModule } from '../membership/membership.module';
import { StatsService } from './stats.service';
import { StatsAiService } from './stats-ai.service';
import { StatsExtractionWorkerService } from './stats-extraction-worker.service';
import { StatsController } from './stats.controller';

@Module({
  imports: [MediaModule, MembershipModule],
  providers: [StatsService, StatsAiService, StatsExtractionWorkerService],
  controllers: [StatsController],
})
export class StatsModule {}
