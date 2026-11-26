/**
 * Adds Health Connect permissions + rationale activity without requiring the
 * react-native-health-connect config plugin to be resolvable at config time
 * (useful when npm registry is unreachable during install).
 *
 * When `react-native-health-connect` is installed, its native code still
 * autolinks; this plugin only patches the AndroidManifest / queries.
 */
const {
  withAndroidManifest,
  AndroidConfig,
} = require('@expo/config-plugins');

const READ_PERMS = [
  'android.permission.health.READ_STEPS',
  'android.permission.health.READ_EXERCISE',
];

function ensureToolsNamespace(manifest) {
  if (!manifest.$) manifest.$ = {};
  if (!manifest.$['xmlns:tools']) {
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
  }
}

function ensurePermission(manifest, name) {
  if (!manifest['uses-permission']) manifest['uses-permission'] = [];
  const list = manifest['uses-permission'];
  if (list.some((p) => p.$?.['android:name'] === name)) return;
  list.push({ $: { 'android:name': name } });
}

function ensureQueriesPackage(manifest, packageName) {
  if (!manifest.queries) manifest.queries = [{}];
  const q = manifest.queries[0];
  if (!q.package) q.package = [];
  if (q.package.some((p) => p.$?.['android:name'] === packageName)) return;
  q.package.push({ $: { 'android:name': packageName } });
}

function ensurePermissionRationaleActivity(manifest) {
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  if (!app.activity) app.activity = [];
  const name = 'androidx.health.connect.client.PermissionController\$ShowUsagePermissionAppActivity';
  // Health Connect docs use ViewPermissionUsageActivity from the SDK —
  // also declare the ACTION_SHOW_PERMISSIONS_RATIONALE intent-filter on MainActivity.
  const main = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
  if (!main['intent-filter']) main['intent-filter'] = [];
  const hasRationale = main['intent-filter'].some((f) =>
    (f.action || []).some(
      (a) => a.$?.['android:name'] === 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE',
    ),
  );
  if (!hasRationale) {
    main['intent-filter'].push({
      action: [
        {
          $: {
            'android:name':
              'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE',
          },
        },
      ],
    });
  }
  void name;
}

function withHealthConnect(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    ensureToolsNamespace(manifest);
    for (const perm of READ_PERMS) ensurePermission(manifest, perm);
    ensureQueriesPackage(manifest, 'com.google.android.apps.healthdata');
    ensurePermissionRationaleActivity(manifest);
    return cfg;
  });
}

module.exports = withHealthConnect;
