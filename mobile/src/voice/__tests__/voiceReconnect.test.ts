import {
  VOICE_RECONNECT_WINDOW_MS,
  createVoiceReconnectPolicy,
  voiceRejoinDelayMs,
} from '../voiceReconnect';

describe('createVoiceReconnectPolicy', () => {
  it('keeps retrying while under the 1 minute window', () => {
    const policy = createVoiceReconnectPolicy();
    const delay = policy.nextRetryDelayInMs({
      retryCount: 0,
      elapsedMs: 0,
    });
    expect(delay).not.toBeNull();
    expect(delay!).toBeGreaterThanOrEqual(0);
    expect(delay!).toBeLessThanOrEqual(500);
  });

  it('stops after the 1 minute window', () => {
    const policy = createVoiceReconnectPolicy();
    expect(
      policy.nextRetryDelayInMs({
        retryCount: 20,
        elapsedMs: VOICE_RECONNECT_WINDOW_MS,
      }),
    ).toBeNull();
    expect(
      policy.nextRetryDelayInMs({
        retryCount: 20,
        elapsedMs: VOICE_RECONNECT_WINDOW_MS + 1,
      }),
    ).toBeNull();
  });

  it('caps the next delay so it does not overshoot the window', () => {
    const policy = createVoiceReconnectPolicy();
    const delay = policy.nextRetryDelayInMs({
      retryCount: 10,
      elapsedMs: VOICE_RECONNECT_WINDOW_MS - 200,
    });
    expect(delay).toBe(200);
  });
});

describe('voiceRejoinDelayMs', () => {
  it('returns null once the window is exhausted', () => {
    expect(voiceRejoinDelayMs(1, VOICE_RECONNECT_WINDOW_MS)).toBeNull();
  });

  it('backs off then caps at 7s', () => {
    expect(voiceRejoinDelayMs(1, 0)).toBe(1_500);
    expect(voiceRejoinDelayMs(5, 0)).toBe(7_000);
  });
});
