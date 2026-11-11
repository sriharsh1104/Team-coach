/**
 * Config plugin to pin Android Gradle Plugin (AGP) to a version compatible
 * with expo-modules-core SDK 52.
 *
 * Root cause: AGP 8.7.0+ changed SoftwareComponent behaviour — the
 * `components.release` property is no longer available before `afterEvaluate`
 * completes. expo-modules-core <=2.2.3 accesses it in a way that throws:
 *   "Could not get unknown property 'release' for SoftwareComponent container"
 *
 * Fix: pin AGP to 8.6.1 which works with Gradle 8.10.2 (EAS cached) AND
 * retains the old component-registration behaviour.
 *
 * AGP ↔ Gradle compatibility: AGP 8.6.x requires Gradle ≥8.7; EAS uses
 * Gradle 8.10.2, so the pair is fully supported.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

const AGP_VERSION = '8.6.1';

const withAndroidAgpVersion = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const buildGradlePath = path.join(
        config.modRequest.platformProjectRoot,
        'build.gradle'
      );

      if (fs.existsSync(buildGradlePath)) {
        let content = fs.readFileSync(buildGradlePath, 'utf8');

        // Pin AGP — replace bare classpath or any existing pinned version
        content = content.replace(
          /classpath\(['"]com\.android\.tools\.build:gradle(?::[^'"]+)?['"]\)/,
          `classpath('com.android.tools.build:gradle:${AGP_VERSION}')`
        );

        fs.writeFileSync(buildGradlePath, content);
        console.log(
          `[withAndroidAgpVersion] Pinned Android Gradle Plugin to ${AGP_VERSION}`
        );
      } else {
        console.warn(
          `[withAndroidAgpVersion] android/build.gradle not found at ${buildGradlePath}`
        );
      }

      return config;
    },
  ]);
};

module.exports = withAndroidAgpVersion;
