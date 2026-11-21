import { mergePushToken, parsePushTokens, removePushToken } from './push-tokens';

describe('push-tokens', () => {
  it('parses pipe-separated tokens', () => {
    expect(parsePushTokens('a|b|c')).toEqual(['a', 'b', 'c']);
    expect(parsePushTokens(null)).toEqual([]);
  });

  it('keeps newest first and caps at 5', () => {
    const merged = mergePushToken('a|b|c|d|e', 'new');
    expect(parsePushTokens(merged)).toEqual(['new', 'a', 'b', 'c', 'd']);
  });

  it('dedupes when re-registering the same token', () => {
    expect(mergePushToken('a|b', 'b')).toBe('b|a');
  });

  it('removes a dead token', () => {
    expect(removePushToken('a|b|c', 'b')).toBe('a|c');
    expect(removePushToken('only', 'only')).toBeNull();
  });
});
