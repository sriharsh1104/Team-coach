import { PushNotificationService, PushMessage } from './push-notification.service';

const A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const B = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';
const C = 'ExponentPushToken[cccccccccccccccccccccc]';

const msg = (to: string): PushMessage => ({ to, title: 't', body: 'b' });

const MIXED_BODY = JSON.stringify({
  errors: [
    {
      code: 'PUSH_TOO_MANY_EXPERIENCE_IDS',
      details: { '@owner-a/app': [A, C], '@owner-b/app': [B] },
    },
  ],
});

function res(status: number, body: string) {
  return { ok: status >= 200 && status < 300, status, text: async () => body } as Response;
}

describe('PushNotificationService', () => {
  let fetchMock: jest.Mock;
  const sentTokens = () =>
    fetchMock.mock.calls.map(
      ([, init]) => (JSON.parse((init as RequestInit).body as string) as { to: string }[]).map((m) => m.to),
    );

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('sends one request when all tokens are from the same project', async () => {
    fetchMock.mockResolvedValue(res(200, '{"data":[]}'));
    await new PushNotificationService().send([msg(A), msg(B)]);
    expect(sentTokens()).toEqual([[A, B]]);
  });

  it('splits a mixed-project request by project so every device still gets its push', async () => {
    fetchMock
      .mockResolvedValueOnce(res(400, MIXED_BODY))
      .mockResolvedValue(res(200, '{"data":[]}'));
    await new PushNotificationService().send([msg(A), msg(B), msg(C)]);
    expect(sentTokens()).toEqual([[A, B, C], [A, C], [B]]);
  });

  it('remembers projects so the next send is grouped up front', async () => {
    fetchMock
      .mockResolvedValueOnce(res(400, MIXED_BODY))
      .mockResolvedValue(res(200, '{"data":[]}'));
    const svc = new PushNotificationService();
    await svc.send([msg(A), msg(B)]);
    fetchMock.mockClear();
    await svc.send([msg(A), msg(B)]);
    expect(sentTokens()).toEqual([[A], [B]]);
  });

  it('falls back to one request per message when the error body is unreadable', async () => {
    fetchMock
      .mockResolvedValueOnce(res(400, 'PUSH_TOO_MANY_EXPERIENCE_IDS not json'))
      .mockResolvedValue(res(200, '{"data":[]}'));
    await new PushNotificationService().send([msg(A), msg(B)]);
    expect(sentTokens()).toEqual([[A, B], [A], [B]]);
  });

  it('still throws for other Expo errors', async () => {
    fetchMock.mockResolvedValue(res(500, 'boom'));
    await expect(new PushNotificationService().send([msg(A)])).rejects.toThrow(/500/);
  });
});
