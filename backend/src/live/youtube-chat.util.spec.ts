import { parseYoutubeVideoId } from './youtube-chat.util';

describe('parseYoutubeVideoId', () => {
  it('accepts a bare 11-char id', () => {
    expect(parseYoutubeVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('parses watch URLs', () => {
    expect(
      parseYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ).toBe('dQw4w9WgXcQ');
  });

  it('parses live and youtu.be URLs', () => {
    expect(parseYoutubeVideoId('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ',
    );
    expect(parseYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ',
    );
  });

  it('rejects junk', () => {
    expect(parseYoutubeVideoId('')).toBeNull();
    expect(parseYoutubeVideoId('not-a-url')).toBeNull();
  });
});
