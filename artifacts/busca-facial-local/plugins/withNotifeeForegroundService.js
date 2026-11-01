const {
  withAndroidManifest,
  AndroidConfig,
} = require('expo/config-plugins');

const SERVICE_NAME = 'app.notifee.core.ForegroundService';
const TOOLS_NS = 'http://schemas.android.com/tools';

module.exports = function withNotifeeForegroundService(config) {
  config = withAndroidManifest(config, async (config) => {
    const manifest = config.modResults;
    const manifestRoot = manifest.manifest;

    // 1. Garantir xmlns:tools no <manifest>
    if (!manifestRoot.$) manifestRoot.$ = {};
    manifestRoot.$['xmlns:tools'] = TOOLS_NS;

    // 2. Localizar/criar o <service> do notifee
    const app = manifestRoot.application?.[0];
    if (!app) {
      throw new Error(
        'withNotifeeForegroundService: application not found in AndroidManifest',
      );
    }
    if (!app.service) app.service = [];

    const existing = app.service.find(
      (s) => s.$?.['android:name'] === SERVICE_NAME,
    );

    if (existing) {
      // Forçar substituição do atributo no merge
      existing.$['android:foregroundServiceType'] = 'dataSync';
      existing.$['tools:replace'] = 'android:foregroundServiceType,android:stopWithTask';
      existing.$['android:exported'] = 'false';
      existing.$['android:stopWithTask'] = 'false';
    } else {
      app.service.push({
        $: {
          'android:name': SERVICE_NAME,
          'android:foregroundServiceType': 'dataSync',
          'tools:replace': 'android:foregroundServiceType,android:stopWithTask',
          'android:exported': 'false',
          'android:stopWithTask': 'false',
        },
      });
    }

    // 3. Adicionar DeviceWakeReceiver para USER_PRESENT e ACTION_POWER_CONNECTED
    if (!app.receiver) app.receiver = [];
    const RECEIVER_NAME = 'expo.modules.wakelock.DeviceWakeReceiver';
    const existingReceiver = app.receiver.find(
      (r) => r.$?.['android:name'] === RECEIVER_NAME,
    );
    if (!existingReceiver) {
      app.receiver.push({
        $: {
          'android:name': RECEIVER_NAME,
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.intent.action.USER_PRESENT' } },
              { $: { 'android:name': 'android.intent.action.ACTION_POWER_CONNECTED' } },
            ],
          },
        ],
      });
    }

    // 4. Garantir meta-data do Google AdMob APPLICATION_ID
    if (!app['meta-data']) app['meta-data'] = [];
    const ADMOB_META_NAME = 'com.google.android.gms.ads.APPLICATION_ID';
    const PROD_ADMOB_APP_ID = 'ca-app-pub-6305008666977043~9018991848';
    const existingAdMobMeta = app['meta-data'].find(
      (m) => m.$?.['android:name'] === ADMOB_META_NAME,
    );
    if (!existingAdMobMeta) {
      app['meta-data'].push({
        $: {
          'android:name': ADMOB_META_NAME,
          'android:value': PROD_ADMOB_APP_ID,
        },
      });
    } else {
      existingAdMobMeta.$['android:value'] = PROD_ADMOB_APP_ID;
    }

    return config;
  });

  return config;
};
