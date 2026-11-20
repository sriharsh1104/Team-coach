import { AppUpdateController } from './app-update.controller';
import { compareVersions } from './version';

describe('compareVersions', () => {
  it('compares numerically, not as strings', () => {
    expect(compareVersions('1.0.10', '1.0.9')).toBe(1);
    expect(compareVersions('1.0.0', '1.0')).toBe(0);
    expect(compareVersions('v2.0.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.2.3', '1.2.4')).toBe(-1);
  });
});

describe('AppUpdateController', () => {
  const env = { ...process.env };
  const controller = new AppUpdateController();
  afterEach(() => {
    process.env = { ...env };
  });

  function configure(extra: Record<string, string>) {
    process.env.APP_LATEST_VERSION = '1.0.3';
    process.env.APP_APK_URL = 'https://example.com/app.apk';
    Object.assign(process.env, extra);
  }

  it('offers the update to an older build', () => {
    configure({ APP_UPDATE_NOTES: 'Guild voice' });
    expect(controller.check('1.0.2')).toEqual({
      updateAvailable: true,
      forced: false,
      latestVersion: '1.0.3',
      apkUrl: 'https://example.com/app.apk',
      notes: 'Guild voice',
    });
  });

  it('does not nag a build that is already current or newer', () => {
    configure({});
    expect(controller.check('1.0.3').updateAvailable).toBe(false);
    expect(controller.check('1.1.0').updateAvailable).toBe(false);
  });

  it('forces builds older than APP_MIN_VERSION', () => {
    configure({ APP_MIN_VERSION: '1.0.2' });
    expect(controller.check('1.0.1').forced).toBe(true);
    expect(controller.check('1.0.2').forced).toBe(false);
  });

  it('stays silent when not configured or the client sends no version', () => {
    delete process.env.APP_LATEST_VERSION;
    delete process.env.APP_APK_URL;
    expect(controller.check('1.0.0').updateAvailable).toBe(false);
    configure({});
    expect(controller.check(undefined).updateAvailable).toBe(false);
  });
});
