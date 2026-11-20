import {
  inviteToJoinInput,
  parseInviteLink,
  peekPendingInvite,
  setPendingInvite,
  takePendingInvite,
} from '../inviteLinks';

describe('parseInviteLink', () => {
  it('reads the app deep link the web page opens', () => {
    expect(parseInviteLink('teamcoach://join/abc123?seat=roster&ref=u1')).toEqual({
      token: 'abc123',
      seat: 'roster',
      ref: 'u1',
    });
  });

  it('reads the https link and defaults to a guild seat', () => {
    expect(parseInviteLink('https://app.example.com/join/tok_9')).toEqual({
      token: 'tok_9',
      seat: 'guild',
      ref: undefined,
    });
  });

  it('ignores game links and junk', () => {
    expect(parseInviteLink('teamcoach://games/room/abc')).toBeNull();
    expect(parseInviteLink('https://api.example.com/games/join/abc')).toBeNull();
    expect(parseInviteLink('')).toBeNull();
    expect(parseInviteLink(null)).toBeNull();
  });
});

describe('inviteToJoinInput', () => {
  it('produces text the backend normalizes (seat + ref kept)', () => {
    expect(inviteToJoinInput({ token: 'abc', seat: 'roster', ref: 'u1' })).toBe(
      '/join/abc?seat=roster&ref=u1',
    );
    expect(inviteToJoinInput({ token: 'abc', seat: 'guild' })).toBe('/join/abc');
  });
});

describe('pending invite store', () => {
  it('keeps an invite until it is taken once', () => {
    setPendingInvite({ token: 't', seat: 'roster' });
    expect(peekPendingInvite()?.token).toBe('t');
    expect(takePendingInvite()?.token).toBe('t');
    expect(takePendingInvite()).toBeNull();
  });
});
