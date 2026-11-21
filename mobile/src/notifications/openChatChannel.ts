/**
 * Process-wide "open this chat" bus. Notification taps (and deep links later)
 * call {@link requestOpenChat}; ChatHubScreen listens and focuses that thread.
 * Pending is kept if the hub isn't mounted yet (cold start / still on login).
 */

export type OpenChatRequest = {
  channelKey: string;
  /** Nice title when the inbox row isn't loaded yet (DM sender name). */
  title?: string;
  senderId?: string;
};

type Listener = (req: OpenChatRequest) => void;

const listeners = new Set<Listener>();
let pending: OpenChatRequest | null = null;

export function requestOpenChat(req: OpenChatRequest) {
  const channelKey = req.channelKey?.trim();
  if (!channelKey) return;
  const next: OpenChatRequest = {
    channelKey,
    title: req.title?.trim() || undefined,
    senderId: req.senderId,
  };
  if (listeners.size === 0) {
    pending = next;
    return;
  }
  pending = null;
  listeners.forEach((listener) => listener(next));
}

export function subscribeOpenChat(listener: Listener): () => void {
  listeners.add(listener);
  if (pending) {
    const req = pending;
    pending = null;
    // Defer so the hub finishes its first paint / channel load.
    setTimeout(() => listener(req), 0);
  }
  return () => {
    listeners.delete(listener);
  };
}
