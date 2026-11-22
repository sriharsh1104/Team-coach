import { Injectable } from '@nestjs/common';
import { Observable, Subject, merge, interval, map } from 'rxjs';
import { MembershipService } from '../membership/membership.service';

export type OrgRealtimeType =
  | 'stats.changed'
  | 'media.changed'
  | 'scrims.changed'
  | 'members.changed'
  /**
   * "Your own seat changed" — accepted into a guild, added to or dropped
   * from the roster, removed from an org. The client re-reads /auth/me, which
   * is what moves it between the auth / guild / main navigators and redraws
   * the sidebar. Delivered on the per-user channel, because the person it
   * concerns is very often not in the org's channel yet.
   */
  | 'membership.changed'
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

  /** Personal channel key — namespaced so it can never collide with an orgId. */
  private static userKey(userId: string) {
    return `user:${userId}`;
  }

  publish(orgId: string, type: Exclude<OrgRealtimeType, 'heartbeat'>) {
    this.emit(orgId, type, orgId);
  }

  /**
   * Send to one person regardless of which org they are in — or whether they
   * are in one at all. Someone waiting on a guild join request has no org
   * channel to listen to, so acceptance could not reach them live at all.
   */
  publishToUser(
    userId: string,
    type: Exclude<OrgRealtimeType, 'heartbeat'>,
    orgId?: string,
  ) {
    this.emit(RealtimeService.userKey(userId), type, orgId);
  }

  private emit(
    key: string,
    type: Exclude<OrgRealtimeType, 'heartbeat'>,
    orgId?: string,
  ) {
    const channel = this.channels.get(key);
    if (!channel) return;
    channel.next({ type, orgId, at: new Date().toISOString() });
  }

  private channelFor(key: string): Subject<OrgRealtimeEvent> {
    let channel = this.channels.get(key);
    if (!channel) {
      channel = new Subject<OrgRealtimeEvent>();
      this.channels.set(key, channel);
    }
    this.listeners.set(key, (this.listeners.get(key) ?? 0) + 1);
    return channel;
  }

  private releaseChannel(key: string) {
    const left = (this.listeners.get(key) ?? 1) - 1;
    if (left <= 0) {
      this.listeners.delete(key);
      const ch = this.channels.get(key);
      this.channels.delete(key);
      ch?.complete();
    } else {
      this.listeners.set(key, left);
    }
  }

  /**
   * One SSE stream per signed-in user. Always carries their personal channel;
   * the org channel is added on top when they have a seat.
   *
   * It used to resolve the roster membership first and error out when there
   * was none — so guild-only members got no live updates at all, and someone
   * waiting on a join request had no stream to be told on.
   */
  streamForUser(userId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let teardown: (() => void) | undefined;
      let cancelled = false;

      void this.membership
        .findOrgId(userId)
        .catch(() => null)
        .then((orgId) => {
          if (cancelled) return;
          const keys = [RealtimeService.userKey(userId)];
          if (orgId) keys.push(orgId);
          const channels = keys.map((key) => this.channelFor(key));

          const heartbeat$ = interval(25_000).pipe(
            map((): OrgRealtimeEvent => ({
              type: 'heartbeat',
              at: new Date().toISOString(),
            })),
          );

          const sub = merge(
            ...channels.map((c) => c.asObservable()),
            heartbeat$,
          )
            .pipe(map((event) => ({ data: event }) as MessageEvent))
            .subscribe({
              next: (msg) => subscriber.next(msg),
              error: (err) => subscriber.error(err),
            });

          // Assigned BEFORE the first emit: a consumer that unsubscribes
          // from inside that very emit (an operator chain ending in take(1),
          // or a client that hangs up immediately) would otherwise run the
          // teardown while this was still undefined — leaking the merge
          // subscription and its 25s heartbeat interval for the life of the
          // process, one per connection.
          teardown = () => {
            sub.unsubscribe();
            for (const key of keys) this.releaseChannel(key);
          };

          subscriber.next({
            data: {
              type: 'heartbeat',
              orgId: orgId ?? undefined,
              at: new Date().toISOString(),
            },
          } as MessageEvent);
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
