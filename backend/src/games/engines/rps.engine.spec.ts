import {
  beats,
  createRpsState,
  rpsForfeit,
  rpsNextRound,
  rpsPick,
  rpsPublicState,
} from './rps.engine';

describe('RPS engine', () => {
  it('knows the three winning pairs and nothing else', () => {
    expect(beats('stone', 'scissors')).toBe(true);
    expect(beats('paper', 'stone')).toBe(true);
    expect(beats('scissors', 'paper')).toBe(true);
    expect(beats('stone', 'paper')).toBe(false);
    expect(beats('stone', 'stone')).toBe(false);
  });

  it('hides picks from the public view until both players have picked', () => {
    const s = createRpsState(['a', 'b']);
    expect(rpsPick(s, 'a', 'stone')).toBe(false);
    const pub = rpsPublicState(s);
    expect(pub.picked).toEqual({ a: true, b: false });
    expect((pub as any).picks).toBeUndefined();
    expect(pub.phase).toBe('picking');
  });

  it('scores a decisive round, replays a draw, and ends at 4 wins', () => {
    const s = createRpsState(['a', 'b']);
    // draw → no score, same round after next
    rpsPick(s, 'a', 'stone');
    expect(rpsPick(s, 'b', 'stone')).toBe(true);
    expect(s.lastResult?.winnerId).toBeNull();
    rpsNextRound(s);
    expect(s.round).toBe(1);
    expect(s.scores).toEqual({ a: 0, b: 0 });

    for (let i = 0; i < 3; i++) {
      rpsPick(s, 'a', 'paper');
      rpsPick(s, 'b', 'stone');
      expect(s.lastResult?.winnerId).toBe('a');
      expect(s.phase).toBe('reveal');
      rpsNextRound(s);
      expect(s.round).toBe(i + 2);
    }
    expect(s.scores.a).toBe(3);
    rpsPick(s, 'a', 'scissors');
    rpsPick(s, 'b', 'paper');
    expect(s.scores.a).toBe(4);
    expect(s.winnerId).toBe('a');
    expect(s.phase).toBe('done');
    expect(s.history).toHaveLength(5);
  });

  it('rejects double picks, outsiders, and picks outside the picking phase', () => {
    const s = createRpsState(['a', 'b']);
    rpsPick(s, 'a', 'stone');
    expect(() => rpsPick(s, 'a', 'paper')).toThrow('already picked');
    expect(() => rpsPick(s, 'zzz', 'paper')).toThrow('Not a player');
    rpsPick(s, 'b', 'paper');
    expect(() => rpsPick(s, 'a', 'paper')).toThrow('Not accepting');
  });

  it('forfeit hands the match to the other player', () => {
    const s = createRpsState(['a', 'b']);
    rpsForfeit(s, 'a');
    expect(s.winnerId).toBe('b');
    expect(s.phase).toBe('done');
  });
});
