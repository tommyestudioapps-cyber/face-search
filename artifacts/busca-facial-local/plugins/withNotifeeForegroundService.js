const {
  withAndroidManifest,
  withMainApplication,
} = require('expo/config-plugins');

const SERVICE_NAME = 'app.notifee.core.ForegroundService';
const GUARDIAN_SERVICE_NAME = 'expo.modules.wakelock.IndexingGuardianService';
const TOOLS_NS = 'http://schemas.android.com/tools';

module.exports = function withNotifeeForegroundService(config) {
  config = withAndroidManifest(config, async (config) => {
    const manifest = config.modResults;
    const manifestRoot = manifest.manifest;

    // 1. Garantir xmlns:tools no <manifest>
    if (!manifestRoot.$) manifestRoot.$ = {};
    manifestRoot.$['xmlns:tools'] = TOOLS_NS;

    // 2. Localizar/criar o <service> do notifee e do Guardião (:keepalive)
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

    const existingGuardian = app.service.find(
      (s) => s.$?.['android:name'] === GUARDIAN_SERVICE_NAME,
    );
    const guardianAttrs = {
      'android:name': GUARDIAN_SERVICE_NAME,
      'android:process': ':keepalive',
      'android:foregroundServiceType': 'dataSync',
      'android:exported': 'false',
      'android:stopWithTask': 'false',
    };
    if (existingGuardian) {
      existingGuardian.$ = { ...existingGuardian.$, ...guardianAttrs };
    } else {
      app.service.push({ $: guardianAttrs });
    }

    const HEADLESS_SERVICE = 'expo.modules.wakelock.IndexingHeadlessService';
    if (!app.service.some((s) => s.$?.['android:name'] === HEADLESS_SERVICE)) {
      app.service.push({
        $: {
          'android:name': HEADLESS_SERVICE,
          'android:exported': 'false',
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

  // 5. Garantir que quando o processo principal subir em background (após swipe nos Recentes,
  // sem MainActivity), a VM JS (mqt_v_js) seja iniciada. Ignora o processo :keepalive.
  config = withMainApplication(config, (config) => {
    let contents = config.modResults.contents;
    if (!contents.includes('isKeepAliveProcess')) {
      contents = contents.replace(
        'ApplicationLifecycleDispatcher.onApplicationCreate(this)',
        `val currentProcessName = if (android.os.Build.VERSION.SDK_INT >= 28) android.app.Application.getProcessName() else ""
    val isKeepAliveProcess = currentProcessName.endsWith(":keepalive")
    if (!isKeepAliveProcess) {
      ApplicationLifecycleDispatcher.onApplicationCreate(this)
      try {
        reactHost.start()
      } catch (e: Throwable) {
        android.util.Log.w("MainApplication", "Falha ao iniciar ReactHost no boot", e)
      }
    }`
      );
      config.modResults.contents = contents;
    }
    return config;
  });

  return config;
};
