const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withNotifeeForegroundService(config) {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application?.[0];
    if (!app) {
      throw new Error(
        'withNotifeeForegroundService: application not found in AndroidManifest',
      );
    }
    if (!app.service) {
      app.service = [];
    }
    const serviceName = 'app.notifee.core.ForegroundService';
    const alreadyDeclared = app.service.some(
      (s) => s.$?.['android:name'] === serviceName,
    );
    if (!alreadyDeclared) {
      app.service.push({
        $: {
          'android:name': serviceName,
          'android:foregroundServiceType': 'dataSync',
          'android:exported': 'false',
        },
      });
    }
    return config;
  });
};
