import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { VoiceService } from './voice.service';
import { VoiceModerateDto } from './dto';

@UseGuards(JwtAuthGuard)
@Controller('voice')
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  /** `?room=guild` for the guild-wide room; anything else = the team room. */
  @Get('config')
  getConfig(
    @CurrentUser() user: { userId: string },
    @Query('room') room?: string,
  ) {
    return this.voiceService.getConfig(user.userId, room === 'guild' ? 'guild' : 'team');
  }

  /** Hosted-voice moderation (mute all / mute one / kick). Enforced server-side. */
  @Post('moderate')
  moderate(@CurrentUser() user: { userId: string }, @Body() dto: VoiceModerateDto) {
    return this.voiceService.moderate(user.userId, dto);
  }
}
