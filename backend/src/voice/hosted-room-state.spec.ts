import {
  applyModeration,
  isUserHostMuted,
  parseRoomState,
} from './hosted-room-state';

describe('hosted room state', () => {
  const empty = parseRoomState(undefined);

  it('parses garbage metadata as an empty room', () => {
    expect(parseRoomState('not json')).toEqual(empty);
    expect(parseRoomState('{"muted":[1,"a"],"speakers":"x"}')).toEqual({
      listenOnly: false,
      muted: ['a'],
      speakers: [],
    });
  });

  it('mute all silences everyone except the owner', () => {
    const s = applyModeration(empty, 'muteAll');
    expect(isUserHostMuted(s, 'u1', false, false)).toBe(true);
    expect(isUserHostMuted(s, 'coach', true, false)).toBe(true);
    expect(isUserHostMuted(s, 'owner', true, true)).toBe(false);
  });

  it('unmuting one person during listen-only lets only them speak', () => {
    let s = applyModeration(empty, 'muteAll');
    s = applyModeration(s, 'unmute', 'u1');
    expect(isUserHostMuted(s, 'u1', false, false)).toBe(false);
    expect(isUserHostMuted(s, 'u2', false, false)).toBe(true);
  });

  it('muting one person outside listen-only only affects them, and survives a rejoin check', () => {
    const s = applyModeration(empty, 'mute', 'u1');
    expect(isUserHostMuted(s, 'u1', false)).toBe(true);
    expect(isUserHostMuted(s, 'u2', false)).toBe(false);
    expect(applyModeration(s, 'mute', 'u1').muted).toEqual(['u1']);
  });

  it('unmute all clears every individual mute', () => {
    let s = applyModeration(empty, 'mute', 'u1');
    s = applyModeration(s, 'muteAll');
    s = applyModeration(s, 'unmuteAll');
    expect(s).toEqual(empty);
  });

  it('requires a target for single-user actions', () => {
    expect(() => applyModeration(empty, 'mute')).toThrow();
  });
});
