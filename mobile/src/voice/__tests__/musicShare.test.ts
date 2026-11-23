import {
  MUSIC_MAX_BYTES,
  isMusicControlMsg,
  musicCacheFileName,
  newMusicShareId,
} from '../musicShare';

describe('musicShare helpers', () => {
  it('builds a safe cache filename from share id + mime', () => {
    expect(musicCacheFileName('mabc123', 'audio/mpeg')).toBe('voice-music-mabc123.mp3');
    expect(musicCacheFileName('m../evil', 'audio/mp4')).toBe('voice-music-mevil.m4a');
  });

  it('creates unique share ids', () => {
    const a = newMusicShareId();
    const b = newMusicShareId();
    expect(a).toMatch(/^m/);
    expect(a).not.toBe(b);
  });

  it('recognizes music control messages only', () => {
    expect(isMusicControlMsg({ type: 'music', op: 'stop', shareId: 'x' })).toBe(true);
    expect(isMusicControlMsg({ type: 'hand_raise', raised: true })).toBe(false);
    expect(isMusicControlMsg(null)).toBe(false);
  });

  it('keeps the transfer cap small enough for live calls', () => {
    expect(MUSIC_MAX_BYTES).toBe(8 * 1024 * 1024);
  });
});
