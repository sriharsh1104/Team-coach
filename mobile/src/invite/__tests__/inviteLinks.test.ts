import {
  inviteToJoinInput,
  isInviteHandled,
  markInviteHandled,
  parseInviteLink,
  peekPendingInvite,
  resetHandledInvites,
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

describe('replayed launch links', () => {
  beforeEach(() => {
    resetHandledInvites();
    setPendingInvite(null);
  });

  // Android hands the same ACTION_VIEW intent back from getInitialURL() on
  // every later cold start, which put "You are already in a guild" on screen
  // at every single login.
  it('remembers a link it has already acted on', () => {
    const invite = parseInviteLink('teamcoach://join/abc123')!;
    expect(isInviteHandled(invite)).toBe(false);
    markInviteHandled(invite);
    expect(isInviteHandled(invite)).toBe(true);
  });

  it('treats the guild and roster seats of one token as different links', () => {
    const guild = parseInviteLink('teamcoach://join/abc123')!;
    const roster = parseInviteLink('teamcoach://join/abc123?seat=roster')!;
    markInviteHandled(guild);

    expect(isInviteHandled(guild)).toBe(true);
    // A roster invite for the same org is a real, separate thing to accept.
    expect(isInviteHandled(roster)).toBe(false);
  });

  it('does not block a different invite', () => {
    markInviteHandled(parseInviteLink('teamcoach://join/abc123')!);
    expect(isInviteHandled(parseInviteLink('teamcoach://join/xyz789')!)).toBe(
      false,
    );
  });

  it('is idempotent — marking twice is not an error', () => {
    const invite = parseInviteLink('teamcoach://join/abc123')!;
    markInviteHandled(invite);
    markInviteHandled(invite);
    expect(isInviteHandled(invite)).toBe(true);
  });
});
