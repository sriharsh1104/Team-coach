import { Injectable } from '@nestjs/common';

/**
 * In-memory "which channel is this user looking at right now" map, plus
 * "is this user's app currently connected at all" (online/offline).
 * Both reset on server restart — that's fine, a socket reconnect repopulates
 * them within seconds, and "online" was never meant to survive a restart.
 */
@Injectable()
export class ChatPresenceTracker {
  /** userId → set of channelKeys they currently have open */
  private readonly viewing = new Map<string, Set<string>>();
  /** userId → set of live socket ids (a user may have the app open on two devices) */
  private readonly online = new Map<string, Set<string>>();

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

  /** Returns true the moment this user's FIRST device comes online. */
  markOnline(userId: string, socketId: string): boolean {
    let set = this.online.get(userId);
    const wasOffline = !set || set.size === 0;
    if (!set) {
      set = new Set();
      this.online.set(userId, set);
    }
    set.add(socketId);
    return wasOffline;
  }

  /** Returns true the moment this user's LAST device goes offline. */
  markOffline(userId: string, socketId: string): boolean {
    const set = this.online.get(userId);
    if (!set) return false;
    set.delete(socketId);
    if (set.size === 0) {
      this.online.delete(userId);
      return true;
    }
    return false;
  }

  isOnline(userId: string): boolean {
    return (this.online.get(userId)?.size ?? 0) > 0;
  }

  onlineUserIds(ids: string[]): string[] {
    return ids.filter((id) => this.isOnline(id));
  }
}
