const { withAndroidManifest } = require('@expo/config-plugins');

const SOCIAL_PACKAGES = [
  'com.instagram.android',
  'com.whatsapp',
  'com.discord',
  'com.google.android.youtube',
  'org.telegram.messenger',
];

/**
 * Android 11+ package visibility: declare social apps so deep links can open
 * them when installed (otherwise the OS falls back to the default browser).
 */
function withSocialPackageQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    if (!manifest.queries) {
      manifest.queries = [{}];
    }
    const queries = manifest.queries[0];
    if (!queries.package) {
      queries.package = [];
    }
    for (const name of SOCIAL_PACKAGES) {
      const exists = queries.package.some(
        (pkg) => pkg.$?.['android:name'] === name,
      );
      if (!exists) {
        queries.package.push({ $: { 'android:name': name } });
      }
    }
    return cfg;
  });
}

module.exports = withSocialPackageQueries;
