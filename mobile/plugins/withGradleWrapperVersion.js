/**
 * Config plugin to pin the Android Gradle wrapper to a version that is
 * compatible with expo-modules-core (SDK 52).
 *
 * Root cause: Gradle 8.9+ changed SoftwareComponent behaviour and
 * expo-modules-core <=2.2.3 uses `components.release` which throws
 * "Could not get unknown property 'release'" on Gradle 8.9+.
 *
 * Fix: force the wrapper to Gradle 8.8.0 which is tested with Expo SDK 52.
 */
const { withGradleProperties } = require('@expo/config-plugins');
const {
  createRunOncePlugin,
  withDangerousMod,
} = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

const GRADLE_VERSION = '8.8.0';

const withGradleWrapperVersion = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const wrapperPropsPath = path.join(
        config.modRequest.platformProjectRoot,
        'gradle',
        'wrapper',
        'gradle-wrapper.properties'
      );

      if (fs.existsSync(wrapperPropsPath)) {
        let content = fs.readFileSync(wrapperPropsPath, 'utf8');

        // Replace any distributionUrl pointing to a gradle-X.Y.Z-all.zip or -bin.zip
        content = content.replace(
          /distributionUrl=.*gradle-[\d.]+-(?:all|bin)\.zip/,
          `distributionUrl=https\\://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-all.zip`
        );

        fs.writeFileSync(wrapperPropsPath, content);
        console.log(
          `[withGradleWrapperVersion] Pinned Gradle wrapper to ${GRADLE_VERSION}`
        );
      } else {
        console.warn(
          `[withGradleWrapperVersion] gradle-wrapper.properties not found at ${wrapperPropsPath}`
        );
      }

      return config;
    },
  ]);
};

module.exports = withGradleWrapperVersion;
