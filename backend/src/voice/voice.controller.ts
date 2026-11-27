import { Body, Controller, Get, Logger, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { VoiceService } from './voice.service';
import { VoiceInviteDto, VoiceModerateDto } from './dto';

@UseGuards(JwtAuthGuard)
@Controller('voice')
export class VoiceController {
  private readonly logger = new Logger('VoiceJoin');

  constructor(private readonly voiceService: VoiceService) {}

  /**
   * Fired by the mobile Join button (and again on connected / error).
   * LiveKit itself connects from the phone, so without this the click
   * never shows up in API logs.
   */
  @Post('join-log')
  joinLog(
    @CurrentUser() user: { userId: string },
    @Body()
    body: { room?: string; phase?: string; detail?: string },
  ) {
    const room =
      body?.room === 'guild' || body?.room === 'direct' ? body.room : 'team';
    const phase = (body?.phase || 'click').slice(0, 24);
    const detail = (body?.detail || '').slice(0, 180);
    this.logger.log(
      `user=${user.userId} room=${room} phase=${phase}${detail ? ` detail=${detail}` : ''}`,
    );
    return { ok: true };
  }

  /**
   * `?room=guild` for the guild-wide room, `?room=direct&peer=<userId>` for a
   * 1-on-1 call (both sides need the admin-granted permission); anything else
   * is the team room.
   */
  @Get('config')
  getConfig(
    @CurrentUser() user: { userId: string },
    @Query('room') room?: string,
    @Query('peer') peer?: string,
  ) {
    return this.voiceService.getConfig(
      user.userId,
      room === 'guild' ? 'guild' : room === 'direct' ? 'direct' : 'team',
      peer,
    );
  }

  /** Who the caller can start a 1-on-1 voice call with. */
  @Get('direct/peers')
  listDirectVoicePeers(@CurrentUser() user: { userId: string }) {
    return this.voiceService.listDirectVoicePeers(user.userId);
  }

  /**
   * Who is already in the voice channel (without joining). Used by the
   * voice lobby and the chat headset indicator.
   */
  @Get('occupancy')
  getOccupancy(
    @CurrentUser() user: { userId: string },
    @Query('room') room?: string,
    @Query('peer') peer?: string,
  ) {
    return this.voiceService.getOccupancy(
      user.userId,
      room === 'guild' ? 'guild' : room === 'direct' ? 'direct' : 'team',
      peer,
    );
  }

  /** Hosted-voice moderation (mute all / mute one / kick). Enforced server-side. */
  @Post('moderate')
  moderate(
    @CurrentUser() user: { userId: string },
    @Body() dto: VoiceModerateDto,
  ) {
    return this.voiceService.moderate(user.userId, dto);
  }

  /** Ping teammates that you are waiting in team voice. */
  @Post('invite')
  invite(@CurrentUser() user: { userId: string }, @Body() dto: VoiceInviteDto) {
    return this.voiceService.invite(user.userId, dto);
  }
}
