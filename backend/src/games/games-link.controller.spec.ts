import { GamesLinkController } from './games-link.controller';

function fakeRes() {
  const res: any = { headers: {} as Record<string, string>, statusCode: 200, body: '' };
  res.setHeader = (k: string, v: string) => {
    res.headers[k] = v;
  };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.send = (b: string) => {
    res.body = b;
    return res;
  };
  return res;
}

describe('GamesLinkController', () => {
  const controller = new GamesLinkController();

  it('serves a page that bounces into the app for a valid room id', () => {
    const res = fakeRes();
    controller.join('abc123def456', res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('teamcoach://games/room/abc123def456');
    expect(res.body).toContain('intent://games/room/abc123def456');
    expect(res.headers['Content-Security-Policy']).toContain("script-src 'unsafe-inline'");
  });

  it('rejects ids that could inject markup or script', () => {
    const res = fakeRes();
    controller.join('"><script>alert(1)</script>', res);
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('<script>alert');
  });
});
