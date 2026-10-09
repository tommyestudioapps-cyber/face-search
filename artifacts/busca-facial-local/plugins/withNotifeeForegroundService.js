const { withAndroidManifest } = require('expo/config-plugins');

const SERVICE_NAME = 'app.notifee.core.ForegroundService';
const DATA_SYNC_ONLY = 'dataSync';

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

    const existing = app.service.find(
      (s) => s.$?.['android:name'] === SERVICE_NAME,
    );

    if (existing) {
      existing.$['android:foregroundServiceType'] = DATA_SYNC_ONLY;
      existing.$['android:exported'] = 'false';
    } else {
      app.service.push({
        $: {
          'android:name': SERVICE_NAME,
          'android:foregroundServiceType': DATA_SYNC_ONLY,
          'android:exported': 'false',
        },
      });
    }

    return config;
  });
};
