import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { MapsController } from './maps.controller';
import { MapsService } from './maps.service';

@Module({
  imports: [MediaModule],
  controllers: [MapsController],
  providers: [MapsService],
})
export class MapsModule {}
