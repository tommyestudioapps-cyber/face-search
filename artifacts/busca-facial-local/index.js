// Task definitions must load before Expo Router mounts a screen (including headless launches).
if (require('react-native').Platform.OS !== 'web') {
  try {
    // Registra handlers do notifee (registerForegroundService, onBackgroundEvent)
    // ANTES de qualquer UI, para funcionar em processo headless.
    require('./services/backgroundIndexing/foregroundService');
    require('./services/backgroundIndexing/backgroundIndexTask');
  } catch (error) {
    // Older dev clients do not contain the new native modules until rebuilt.
    console.error('[BackgroundIndex] Native task unavailable; rebuild the app.', error);
  }
}

require('expo-router/entry');