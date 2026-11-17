const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// three.js resolves to build/three.cjs under Metro (no package-exports
// support); needed for the 3D game boards (@react-three/fiber + expo-gl).
config.resolver.sourceExts = [...config.resolver.sourceExts, 'cjs'];

// RN 0.76 ships Platform.ios.js / Platform.android.js only. When Metro
// bundles a deep react-native StyleSheet file for web, the relative
// `../Utilities/Platform` import has nothing to resolve — map it to
// react-native-web's Platform export.
const webPlatform = require.resolve('react-native-web/dist/exports/Platform');
const upstreamResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === 'web' &&
    (moduleName === '../Utilities/Platform' ||
      moduleName === '../../Utilities/Platform' ||
      moduleName.endsWith('/Libraries/Utilities/Platform'))
  ) {
    return { filePath: webPlatform, type: 'sourceFile' };
  }
  if (upstreamResolve) {
    return upstreamResolve(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
