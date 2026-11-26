/**
 * Health Connect setup for Tracker Health:
 * - AndroidManifest permissions + Health Connect package query + rationale
 *   intent-filter on MainActivity
 * - MainActivity.onCreate registers HealthConnectPermissionDelegate (required
 *   by react-native-health-connect — without it requestPermission crashes)
 *
 * The RN package still autolinks; this local plugin avoids needing
 * expo-health-connect at `expo config` time.
 */
const {
  withAndroidManifest,
  withMainActivity,
  AndroidConfig,
} = require('@expo/config-plugins');

const READ_PERMS = [
  'android.permission.health.READ_STEPS',
  'android.permission.health.READ_EXERCISE',
  'android.permission.ACTIVITY_RECOGNITION',
];

const HC_IMPORT =
  'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate';
const HC_DELEGATE_CALL =
  '    // Required by react-native-health-connect — registers the permission contract.';
const HC_DELEGATE_LINE =
  '    HealthConnectPermissionDelegate.setPermissionDelegate(this)';

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
  const main = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
  if (!main['intent-filter']) main['intent-filter'] = [];
  const hasRationale = main['intent-filter'].some((f) =>
    (f.action || []).some(
      (a) =>
        a.$?.['android:name'] ===
        'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE',
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
}

function withHealthConnectManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    ensureToolsNamespace(manifest);
    for (const perm of READ_PERMS) ensurePermission(manifest, perm);
    ensureQueriesPackage(manifest, 'com.google.android.apps.healthdata');
    ensurePermissionRationaleActivity(manifest);
    return cfg;
  });
}

function withHealthConnectMainActivity(config) {
  return withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') {
      throw new Error(
        'withHealthConnect expects a Kotlin MainActivity (Expo SDK 50+)',
      );
    }
    let src = cfg.modResults.contents;
    if (!src.includes(HC_IMPORT)) {
      src = src.replace(/^(package [^\n]+\n)/m, `$1\n${HC_IMPORT}\n`);
    }
    if (!src.includes('HealthConnectPermissionDelegate.setPermissionDelegate')) {
      // Prefer after super.onCreate(...) so the Activity is ready to register
      // the Activity Result contract (required by AndroidX).
      const replaced = src.replace(
        /(super\.onCreate\([^\)]*\)\s*\n)/,
        `$1${HC_DELEGATE_CALL}\n${HC_DELEGATE_LINE}\n`,
      );
      if (replaced === src) {
        throw new Error(
          'withHealthConnect: could not find super.onCreate() in MainActivity.kt',
        );
      }
      src = replaced;
    }
    cfg.modResults.contents = src;
    return cfg;
  });
}

function withHealthConnect(config) {
  config = withHealthConnectManifest(config);
  config = withHealthConnectMainActivity(config);
  return config;
}

module.exports = withHealthConnect;
