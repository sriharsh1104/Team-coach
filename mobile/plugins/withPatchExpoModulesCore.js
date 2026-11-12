/**
 * Config plugin that patches ExpoModulesCorePlugin.gradle to fix a timing
 * issue with Gradle 8.x and expo-modules-core <=2.2.3.
 *
 * Root cause:
 *   In Gradle 8.x, `components.release` throws
 *   "Could not get unknown property 'release' for SoftwareComponent container"
 *   when accessed inside afterEvaluate blocks, because the Android Gradle Plugin
 *   registers software components lazily.
 *
 * Fix (triple-afterEvaluate):
 *   Wrap `from components.release` in an additional `project.afterEvaluate` so
 *   it resolves only after AGP has fully registered the release component.
 *   The outer double-afterEvaluate handles the publishing block timing;
 *   the inner third afterEvaluate handles the component resolution timing.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

const PATCH_MARKER = '// [PATCHED: triple-afterEvaluate for components.release]';

const withPatchExpoModulesCore = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
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

      // Already fully patched
      if (content.includes(PATCH_MARKER)) {
        console.log('[withPatchExpoModulesCore] Already patched (triple-afterEvaluate), skipping.');
        return config;
      }

      // Step 1: Apply double-afterEvaluate around the publishing block (if not already)
      if (!content.includes('// [PATCHED: double-afterEvaluate]')) {
        const SEARCH = /project\.afterEvaluate\s*\{\s*\n(\s*)publishing\s*\{/;
        const REPLACE = `project.afterEvaluate {\n    project.afterEvaluate { // [PATCHED: double-afterEvaluate]\n$1publishing {`;

        if (SEARCH.test(content)) {
          content = content.replace(SEARCH, REPLACE);

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
                content = content.slice(0, i) + '  }\n' + content.slice(i);
                break;
              }
            }
            i++;
          }
        }
      }

      // Step 2: Wrap `from components.release` in a third afterEvaluate
      const FROM_SEARCH = /(\s*)(from components\.release)/;
      if (FROM_SEARCH.test(content)) {
        content = content.replace(
          FROM_SEARCH,
          `$1project.afterEvaluate { ${PATCH_MARKER}\n$1  $2\n$1}`,
        );
        fs.writeFileSync(pluginPath, content);
        console.log('[withPatchExpoModulesCore] Patched ExpoModulesCorePlugin.gradle with triple-afterEvaluate');
      } else {
        console.warn('[withPatchExpoModulesCore] Could not find "from components.release" to patch');
      }

      return config;
    },
  ]);
};

module.exports = withPatchExpoModulesCore;
