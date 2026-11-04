/**
 * Simple in-memory sliding-window limiter for Socket.IO event handlers.
 * `@nestjs/throttler`'s ThrottlerGuard only covers HTTP execution contexts —
 * nothing today stops a connected socket from calling an event as fast as
 * the event loop allows (e.g. flooding chat `message:send`, or spamming
 * mediasoup's `createTransport`/`produce`). One instance per gateway, shared
 * across all its sockets; single-process only, matching how the mediasoup
 * SFU itself already assumes a single backend instance.
 */
export class WsRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Records a hit for `key` and returns whether it's still within the limit. */
  allow(key: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > windowStart);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  /** Drops a key's history — call on disconnect so the map doesn't grow forever. */
  clear(key: string): void {
    this.hits.delete(key);
  }
}
