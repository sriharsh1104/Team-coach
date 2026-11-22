import { firstValueFrom, take, toArray } from 'rxjs';
import { RealtimeService } from './realtime.service';
import { MembershipService } from '../membership/membership.service';

type Event = { type: string; orgId?: string };

function build(orgIdByUser: Record<string, string | null>) {
  const membership = {
    findOrgId: jest.fn((userId: string) =>
      Promise.resolve(orgIdByUser[userId] ?? null),
    ),
  } as unknown as MembershipService;
  return new RealtimeService(membership);
}

/** Opens a stream and waits for its initial heartbeat, so channels exist. */
async function open(service: RealtimeService, userId: string) {
  const seen: Event[] = [];
  const sub = service
    .streamForUser(userId)
    .subscribe((msg) => seen.push((msg as { data: Event }).data));
  // The subscription resolves membership asynchronously.
  await new Promise((r) => setTimeout(r, 0));
  return { seen, stop: () => sub.unsubscribe() };
}

describe('RealtimeService', () => {
  it('streams org events to a member of that org', async () => {
    const service = build({ u1: 'org-1' });
    const { seen, stop } = await open(service, 'u1');

    service.publish('org-1', 'members.changed');

    expect(seen.map((e) => e.type)).toEqual(['heartbeat', 'members.changed']);
    stop();
  });

  // Guild-only members have no roster Membership. The old implementation
  // resolved one and errored out, so they got no live updates at all.
  it('still opens a stream for someone with no org at all', async () => {
    const service = build({ u1: null });
    const { seen, stop } = await open(service, 'u1');

    expect(seen).toHaveLength(1);
    expect(seen[0].type).toBe('heartbeat');
    stop();
  });

  // The whole point: someone waiting on a guild join request belongs to no
  // org, so acceptance had no channel to reach them on.
  it('delivers a personal event to a user with no org', async () => {
    const service = build({ u1: null });
    const { seen, stop } = await open(service, 'u1');

    service.publishToUser('u1', 'membership.changed', 'org-1');

    expect(seen.map((e) => e.type)).toEqual([
      'heartbeat',
      'membership.changed',
    ]);
    expect(seen[1].orgId).toBe('org-1');
    stop();
  });

  it('keeps one user’s personal events away from everyone else', async () => {
    const service = build({ u1: 'org-1', u2: 'org-1' });
    const a = await open(service, 'u1');
    const b = await open(service, 'u2');

    service.publishToUser('u1', 'membership.changed');

    expect(a.seen.map((e) => e.type)).toContain('membership.changed');
    expect(b.seen.map((e) => e.type)).not.toContain('membership.changed');
    a.stop();
    b.stop();
  });

  it('a member in an org gets both their personal and their org events', async () => {
    const service = build({ u1: 'org-1' });
    const { seen, stop } = await open(service, 'u1');

    service.publish('org-1', 'members.changed');
    service.publishToUser('u1', 'membership.changed');

    expect(seen.map((e) => e.type)).toEqual([
      'heartbeat',
      'members.changed',
      'membership.changed',
    ]);
    stop();
  });

  it('drops a channel once its last listener leaves', async () => {
    const service = build({ u1: 'org-1' });
    const first = await open(service, 'u1');
    const second = await open(service, 'u1');

    first.stop();
    service.publish('org-1', 'members.changed');
    expect(second.seen.map((e) => e.type)).toContain('members.changed');

    second.stop();
    // Nothing listening — publishing must be a no-op, not a throw.
    expect(() => service.publish('org-1', 'members.changed')).not.toThrow();
  });

  it('publishing to an org nobody is watching is harmless', async () => {
    const service = build({});
    expect(() => service.publish('ghost-org', 'stats.changed')).not.toThrow();
    expect(() =>
      service.publishToUser('ghost-user', 'membership.changed'),
    ).not.toThrow();
  });

  it('sends a heartbeat first so the client knows it is connected', async () => {
    const service = build({ u1: 'org-1' });
    const stream = service.streamForUser('u1');
    const first = await firstValueFrom(stream.pipe(take(1), toArray()));
    expect((first[0] as unknown as { data: Event }).data.type).toBe(
      'heartbeat',
    );
  });
});
