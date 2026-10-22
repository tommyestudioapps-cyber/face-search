const {
  withAndroidManifest,
  withMainActivity,
  withMainApplication,
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

    return config;
  });

  config = withMainActivity(config, async (config) => {
    let contents = config.modResults.contents;
    const replacement = `fabricEnabled
          ) {
              override fun onDestroy() {
                  if (expo.modules.wakelock.WakeLockModule.isKeepAliveActive()) {
                      android.util.Log.w("MainActivity", "[KeepAlive] Preservando runtime JS durante onDestroy")
                      return
                  }
                  super.onDestroy()
              }
          }`;

    contents = contents.replace(/fabricEnabled\s*\)\s*\{\s*\}/, replacement);
    config.modResults.contents = contents;
    return config;
  });

  config = withMainApplication(config, async (config) => {
    let contents = config.modResults.contents;
    const target = 'ApplicationLifecycleDispatcher.onApplicationCreate(this)';
    const replacement = `ApplicationLifecycleDispatcher.onApplicationCreate(this)
    try {
      android.util.Log.i("MainApplication", "[KeepAlive] Pre-inicializando reactHost para ForegroundService")
      reactHost.start()
    } catch (e: Throwable) {
      android.util.Log.w("MainApplication", "[KeepAlive] Falha ao iniciar reactHost, tentando fallback createReactContextInBackground", e)
      try {
        reactNativeHost.reactInstanceManager.createReactContextInBackground()
      } catch (_: Throwable) {}
    }`;

    if (!contents.includes('[KeepAlive] Pre-inicializando reactHost')) {
      contents = contents.replace(target, replacement);
      config.modResults.contents = contents;
    }
    return config;
  });

  return config;
};
