/**
 * Process-wide "open voice" bus. Ongoing-call notification taps and deep
 * links call {@link requestOpenVoice}; a bridge inside the signed-in
 * navigator listens and navigates to Team / Guild Voice.
 */

export type OpenVoiceRequest = {
  room: 'team' | 'guild';
};

type Listener = (req: OpenVoiceRequest) => void;

const listeners = new Set<Listener>();
let pending: OpenVoiceRequest | null = null;

export function requestOpenVoice(req: OpenVoiceRequest) {
  const room = req.room === 'guild' ? 'guild' : 'team';
  const next: OpenVoiceRequest = { room };
  if (listeners.size === 0) {
    pending = next;
    return;
  }
  pending = null;
  listeners.forEach((listener) => listener(next));
}

export function subscribeOpenVoice(listener: Listener): () => void {
  listeners.add(listener);
  if (pending) {
    const req = pending;
    pending = null;
    setTimeout(() => listener(req), 0);
  }
  return () => {
    listeners.delete(listener);
  };
}

/** Parse `teamcoach://voice/team` / `teamcoach://voice/guild` (and variants). */
export function parseVoiceDeepLink(url: string | null | undefined): OpenVoiceRequest | null {
  if (!url) return null;
  const m = url.match(/^teamcoach:\/\/voice\/(team|guild)(?:[/?#]|$)/i);
  if (!m?.[1]) return null;
  return { room: m[1].toLowerCase() === 'guild' ? 'guild' : 'team' };
}
