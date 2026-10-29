const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

for (const extension of ['task', 'tflite']) {
  if (!config.resolver.assetExts.includes(extension)) {
    config.resolver.assetExts.push(extension);
  }
}

const diagAds = process.env.EXPO_PUBLIC_DIAG_ADS;
if (diagAds === 'off') {
  console.log('[metro] EXPO_PUBLIC_DIAG_ADS=off: stubbing react-native-google-mobile-ads');
  const admobStubPath = path.resolve(__dirname, 'services/ads/admobStub.ts');
  const defaultResolver = config.resolver.resolveRequest;

  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === 'react-native-google-mobile-ads') {
      return {
        filePath: admobStubPath,
        type: 'sourceFile',
      };
    }
    if (defaultResolver) {
      return defaultResolver(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;
