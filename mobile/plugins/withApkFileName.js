const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Names the release APK so downloads / sideloads are not a bare "artifact" file.
 * Expo dashboard may still suggest a generic name; the archive itself is
 * SacredTeamCoach-<version>.apk and `eas build:download -o …` preserves it.
 */
function withApkFileName(config, { name = 'SacredTeamCoach' } = {}) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg;
    if (cfg.modResults.contents.includes('SacredTeamCoach APK filename')) {
      return cfg;
    }
    cfg.modResults.contents += `

// SacredTeamCoach APK filename (added by plugins/withApkFileName.js)
android.applicationVariants.configureEach { variant ->
    variant.outputs.configureEach { output ->
        def vName = variant.versionName ?: "1.0.0"
        output.outputFileName = "${name}-\${vName}.apk"
    }
}
`;
    return cfg;
  });
}

module.exports = withApkFileName;
