import { Controller, Sse, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RealtimeService } from './realtime.service';

@UseGuards(JwtAuthGuard)
@Controller('realtime')
export class RealtimeController {
  constructor(private readonly realtime: RealtimeService) {}

  /**
   * Long-lived SSE stream. Auth via Bearer (mobile XHR client sets the
   * header — browsers' native EventSource cannot). Throttling skipped so
   * the open connection isn't counted against the per-minute request cap.
   */
  @SkipThrottle()
  @Sse('stream')
  stream(
    @CurrentUser() user: { userId: string },
  ): Observable<MessageEvent> {
    return this.realtime.streamForUser(user.userId);
  }
}
