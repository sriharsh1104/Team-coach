import { Module } from '@nestjs/common';
import { MembershipModule } from '../membership/membership.module';
import { WebsiteController } from './website.controller';
import { WebsiteService } from './website.service';

@Module({
  imports: [MembershipModule],
  controllers: [WebsiteController],
  providers: [WebsiteService],
})
export class WebsiteModule {}
