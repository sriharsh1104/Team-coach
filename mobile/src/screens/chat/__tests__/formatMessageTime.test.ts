import { formatMessageTime } from '../ChatScreen';

describe('formatMessageTime', () => {
  const at = (h: number, m: number) => new Date(2026, 10, 20, h, m).toISOString();

  it('formats afternoon times like "4:49 pm"', () => {
    expect(formatMessageTime(at(16, 49))).toBe('4:49 pm');
  });
  it('formats morning, midnight and noon', () => {
    expect(formatMessageTime(at(9, 5))).toBe('9:05 am');
    expect(formatMessageTime(at(0, 0))).toBe('12:00 am');
    expect(formatMessageTime(at(12, 30))).toBe('12:30 pm');
  });
  it('returns empty for missing/invalid input', () => {
    expect(formatMessageTime(null)).toBe('');
    expect(formatMessageTime('nope')).toBe('');
  });
});
