/**
 * Config plugin that patches ExpoModulesCorePlugin.gradle to fix a timing
 * issue with Gradle 8.x and expo-modules-core <=2.2.3.
 *
 * Root cause:
 *   In Gradle 8.x, `components.release` throws
 *   "Could not get unknown property 'release' for SoftwareComponent container"
 *   when accessed in a single `project.afterEvaluate` block, because the
 *   Android Gradle Plugin registers the software component lazily in its own
 *   afterEvaluate callback — which may run AFTER expo's single-level afterEvaluate.
 *
 * Fix:
 *   Wrap the `publishing { publications { ... } }` block inside a second
 *   `project.afterEvaluate` (double-afterEvaluate pattern), so it executes
 *   after AGP has had a chance to register the `release` component.
 *
 * This is the canonical fix used by the Expo team in later SDK releases.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

const withPatchExpoModulesCore = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      // Patch the file in node_modules (on EAS cloud it lives in
      // /home/expo/workingdir/build/mobile/node_modules/...)
      const pluginPath = path.resolve(
        config.modRequest.projectRoot,
        'node_modules',
        'expo-modules-core',
        'android',
        'ExpoModulesCorePlugin.gradle'
      );

      if (!fs.existsSync(pluginPath)) {
        console.warn(`[withPatchExpoModulesCore] File not found: ${pluginPath}`);
        return config;
      }

      let content = fs.readFileSync(pluginPath, 'utf8');

      // Only patch if not already patched
      if (content.includes('// [PATCHED: double-afterEvaluate]')) {
        console.log('[withPatchExpoModulesCore] Already patched, skipping.');
        return config;
      }

      // Replace:
      //   project.afterEvaluate {
      //     publishing { publications { release(MavenPublication) { from components.release } } }
      //   }
      //
      // With:
      //   project.afterEvaluate {
      //     project.afterEvaluate { // [PATCHED: double-afterEvaluate]
      //       publishing { publications { release(MavenPublication) { from components.release } } }
      //     }
      //   }

      const SEARCH = /project\.afterEvaluate\s*\{\s*\n(\s*)publishing\s*\{/;
      const REPLACE = `project.afterEvaluate {\n    project.afterEvaluate { // [PATCHED: double-afterEvaluate]\n$1publishing {`;

      if (SEARCH.test(content)) {
        content = content.replace(SEARCH, REPLACE);

        // We also need to close the extra afterEvaluate block.
        // The structure is:
        //   project.afterEvaluate {
        //     publishing { ... }
        //     repositories { ... }
        //   }
        // After patch it becomes:
        //   project.afterEvaluate {
        //     project.afterEvaluate {
        //       publishing { ... }
        //       repositories { ... }
        //     }  <-- we need to add this closing brace
        //   }
        //
        // Find the closing brace of the outer afterEvaluate and add an extra one.
        // Strategy: count braces after our patch marker.

        const patchMarker = '// [PATCHED: double-afterEvaluate]';
        const markerIdx = content.indexOf(patchMarker);
        const afterMarker = content.indexOf('\n', markerIdx);

        let depth = 0;
        let i = afterMarker;
        while (i < content.length) {
          if (content[i] === '{') depth++;
          else if (content[i] === '}') {
            depth--;
            if (depth < 0) {
              // This is the closing brace of the outer afterEvaluate
              // Insert an extra closing brace before it
              content = content.slice(0, i) + '  }\n' + content.slice(i);
              break;
            }
          }
          i++;
        }

        fs.writeFileSync(pluginPath, content);
        console.log('[withPatchExpoModulesCore] Patched ExpoModulesCorePlugin.gradle with double-afterEvaluate');
      } else {
        console.warn('[withPatchExpoModulesCore] Could not find pattern to patch in ExpoModulesCorePlugin.gradle');
      }

      return config;
    },
  ]);
};

module.exports = withPatchExpoModulesCore;
