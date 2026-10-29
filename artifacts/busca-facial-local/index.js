const { bootMark } = require('./services/observability/bootTrace');
bootMark('index.js start');

// Task definitions must load before Expo Router mounts a screen (including headless launches).
if (require('react-native').Platform.OS !== 'web') {
  try {
    bootMark('index.js require foregroundService start');
    require('./services/backgroundIndexing/foregroundService');
    bootMark('index.js require foregroundService done');

    bootMark('index.js require backgroundIndexTask start');
    require('./services/backgroundIndexing/backgroundIndexTask');
    bootMark('index.js require backgroundIndexTask done');
  } catch (error) {
    console.error('[BackgroundIndex] Native task unavailable; rebuild the app.', error);
  }
}

bootMark('index.js require expo-router/entry start');
require('expo-router/entry');
bootMark('index.js require expo-router/entry done');
