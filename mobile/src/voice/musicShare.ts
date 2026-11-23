/**
 * Team-voice music share — peer-to-peer over LiveKit data messages.
 *
 * Nothing is uploaded to our API / DB / Cloudinary. The file is read from the
 * sharer's phone, broadcast in small chunks to the room, and written only to
 * each listener's on-device cache (deleted when the share stops).
 */

export const MUSIC_TOPIC = 'music';

/** Keep transfers short so voice quality does not tank mid-call. */
export const MUSIC_MAX_BYTES = 8 * 1024 * 1024;

/** Raw audio bytes per chunk before base64 (~8KB on the wire). */
export const MUSIC_CHUNK_BYTES = 6_000;

export type MusicShareInfo = {
  shareId: string;
  title: string;
  /** Local user started this share. */
  isLocal: boolean;
  status: 'sending' | 'playing' | 'paused';
  /** 0–1 while sending. */
  progress: number;
  fromName: string;
};

export type MusicControlMsg =
  | {
      type: 'music';
      op: 'offer';
      shareId: string;
      title: string;
      mime: string;
      bytes: number;
      /** Number of chunk messages that will follow. */
      total: number;
      fromName: string;
    }
  | {
      type: 'music';
      op: 'chunk';
      shareId: string;
      index: number;
      total: number;
      data: string;
    }
  | { type: 'music'; op: 'play'; shareId: string; atMs: number }
  | { type: 'music'; op: 'pause'; shareId: string }
  | { type: 'music'; op: 'stop'; shareId: string };

export function isMusicControlMsg(value: unknown): value is MusicControlMsg {
  if (!value || typeof value !== 'object') return false;
  const v = value as { type?: unknown; op?: unknown };
  return v.type === 'music' && typeof v.op === 'string';
}

export function musicCacheFileName(shareId: string, mime: string): string {
  const ext =
    mime.includes('mpeg') || mime.includes('mp3')
      ? 'mp3'
      : mime.includes('mp4') || mime.includes('m4a')
        ? 'm4a'
        : mime.includes('wav')
          ? 'wav'
          : mime.includes('aac')
            ? 'aac'
            : 'audio';
  const safe = shareId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'share';
  return `voice-music-${safe}.${ext}`;
}

export function newMusicShareId(): string {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
