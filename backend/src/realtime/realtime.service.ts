import { Injectable } from '@nestjs/common';
import { Observable, Subject, merge, interval, map } from 'rxjs';
import { MembershipService } from '../membership/membership.service';

export type OrgRealtimeType =
  | 'stats.changed'
  | 'media.changed'
  | 'scrims.changed'
  | 'heartbeat';

export type OrgRealtimeEvent = {
  type: OrgRealtimeType;
  orgId?: string;
  at: string;
};

/**
 * In-process fan-out for org-scoped Server-Sent Events. Fine for a single
 * API instance (same constraint as the extraction worker). Publish from
 * mutation services; clients subscribe via GET /realtime/stream.
 */
@Injectable()
export class RealtimeService {
  private readonly channels = new Map<string, Subject<OrgRealtimeEvent>>();
  private readonly listeners = new Map<string, number>();

  constructor(private readonly membership: MembershipService) {}

  publish(orgId: string, type: Exclude<OrgRealtimeType, 'heartbeat'>) {
    const channel = this.channels.get(orgId);
    if (!channel) return;
    channel.next({ type, orgId, at: new Date().toISOString() });
  }

  streamForUser(userId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let teardown: (() => void) | undefined;
      let cancelled = false;

      void this.membership
        .getMembership(userId)
        .then((membership) => {
          if (cancelled) return;
          const orgId = membership.orgId;
          let channel = this.channels.get(orgId);
          if (!channel) {
            channel = new Subject<OrgRealtimeEvent>();
            this.channels.set(orgId, channel);
          }
          this.listeners.set(orgId, (this.listeners.get(orgId) ?? 0) + 1);

          const heartbeat$ = interval(25_000).pipe(
            map(
              (): OrgRealtimeEvent => ({
                type: 'heartbeat',
                at: new Date().toISOString(),
              }),
            ),
          );

          const sub = merge(channel.asObservable(), heartbeat$)
            .pipe(map((event) => ({ data: event }) as MessageEvent))
            .subscribe({
              next: (msg) => subscriber.next(msg),
              error: (err) => subscriber.error(err),
            });

          subscriber.next({
            data: {
              type: 'heartbeat',
              orgId,
              at: new Date().toISOString(),
            },
          } as MessageEvent);

          teardown = () => {
            sub.unsubscribe();
            const left = (this.listeners.get(orgId) ?? 1) - 1;
            if (left <= 0) {
              this.listeners.delete(orgId);
              const ch = this.channels.get(orgId);
              this.channels.delete(orgId);
              ch?.complete();
            } else {
              this.listeners.set(orgId, left);
            }
          };
        })
        .catch((err) => {
          if (!cancelled) subscriber.error(err);
        });

      return () => {
        cancelled = true;
        teardown?.();
      };
    });
  }
}
