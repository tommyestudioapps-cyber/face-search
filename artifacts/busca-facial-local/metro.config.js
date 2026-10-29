const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

for (const extension of ['task', 'tflite']) {
  if (!config.resolver.assetExts.includes(extension)) {
    config.resolver.assetExts.push(extension);
  }
}

const SINGLETON_PACKAGES = new Set([
  'react',
  'react-dom',
  'react-is',
  'react-native',
  'react-native-reanimated',
  'react-native-worklets',
  'react-native-worklets-core',
  'react-native-gesture-handler',
  'react-native-safe-area-context',
  'react-native-screens',
  'react-native-svg',
  'react-native-vision-camera',
  'react-native-fast-tflite',
  'react-native-mediapipe',
  'react-native-nitro-modules',
  'react-native-google-mobile-ads',
  'expo',
  'expo-router',
  'expo-constants',
  'expo-linking',
  'expo-sqlite',
  'expo-asset',
  'expo-file-system',
  'expo-font',
  'expo-modules-core',
  '@expo/vector-icons',
  '@expo/metro-runtime',
]);

const appEntryPath = path.join(__dirname, 'index.js');
const appNodeModules = path.join(__dirname, 'node_modules');

function getPackageName(moduleName) {
  if (
    moduleName.startsWith('.') ||
    moduleName.startsWith('/') ||
    /^[a-zA-Z]:/.test(moduleName)
  ) {
    return null;
  }
  const parts = moduleName.split('/');
  if (moduleName.startsWith('@')) {
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  }
  return parts[0];
}

const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstreamResolveRequest || context.resolveRequest;
  const pkgName = getPackageName(moduleName);

  if (
    pkgName &&
    SINGLETON_PACKAGES.has(pkgName) &&
    fs.existsSync(path.join(appNodeModules, pkgName))
  ) {
    return resolve(
      {
        ...context,
        originModulePath: appEntryPath,
      },
      moduleName,
      platform,
    );
  }

  return resolve(context, moduleName, platform);
};

module.exports = config;
