import { Injectable } from '@nestjs/common';

/**
 * In-memory "which channel is this user looking at right now" map.
 * Used to suppress push notifications while the chat thread is open and
 * the app is foregrounded (socket still connected + channel:join).
 */
@Injectable()
export class ChatPresenceTracker {
  /** userId → set of channelKeys they currently have open */
  private readonly viewing = new Map<string, Set<string>>();

  setViewing(userId: string, channelKey: string) {
    let set = this.viewing.get(userId);
    if (!set) {
      set = new Set();
      this.viewing.set(userId, set);
    }
    set.add(channelKey);
  }

  clearViewing(userId: string, channelKey?: string) {
    if (!channelKey) {
      this.viewing.delete(userId);
      return;
    }
    const set = this.viewing.get(userId);
    if (!set) return;
    set.delete(channelKey);
    if (set.size === 0) this.viewing.delete(userId);
  }

  isViewing(userId: string, channelKey: string): boolean {
    return this.viewing.get(userId)?.has(channelKey) ?? false;
  }
}
