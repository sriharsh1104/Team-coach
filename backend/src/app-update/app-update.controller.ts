import { Controller, Get, Header, Query } from '@nestjs/common';
import { compareVersions } from './version';

/**
 * Tells the Android APK whether a newer build exists (testing phase: the app
 * is shared as an APK, not through Play Store). Configured purely by env, so a
 * release is: upload the APK, set APP_LATEST_VERSION + APP_APK_URL, restart.
 *
 *   APP_LATEST_VERSION  newest version, e.g. 1.0.3 (unset = never prompt)
 *   APP_MIN_VERSION     builds older than this must update (blocks the app)
 *   APP_APK_URL         direct https download link of the newest APK
 *   APP_UPDATE_NOTES    short "what's new" text
 */
@Controller('app')
export class AppUpdateController {
  @Get('update')
  @Header('Cache-Control', 'no-store')
  check(@Query('version') version?: string) {
    const latest = process.env.APP_LATEST_VERSION?.trim() || null;
    const min = process.env.APP_MIN_VERSION?.trim() || null;
    const apkUrl = process.env.APP_APK_URL?.trim() || null;
    const notes = process.env.APP_UPDATE_NOTES?.trim() || null;
    const current = (version ?? '').slice(0, 32).trim();

    // Without a download link there is nothing useful to offer.
    const known = !!current && !!latest && !!apkUrl;
    const updateAvailable = known && compareVersions(latest!, current) > 0;
    const forced =
      updateAvailable && !!min && compareVersions(min, current) > 0;

    return { updateAvailable, forced, latestVersion: latest, apkUrl, notes };
  }
}
