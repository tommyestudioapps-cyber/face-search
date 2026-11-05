const {
  withAndroidManifest,
  withMainApplication,
  withMainActivity,
} = require('expo/config-plugins');

const SERVICE_NAME = 'app.notifee.core.ForegroundService';
const TOOLS_NS = 'http://schemas.android.com/tools';

const BOOT_MARKER = '// BGD_REACT_HOST_BOOT';

function withBackgroundReactHostBootstrap(config) {
  return withMainApplication(config, (cfg) => {
    let contents = cfg.modResults.contents;

    if (contents.includes(BOOT_MARKER)) {
      return cfg;
    }

    const marker = 'ApplicationLifecycleDispatcher.onApplicationCreate(this)';
    const index = contents.indexOf(marker);
    if (index === -1) {
      throw new Error(
        'withBackgroundReactHostBootstrap: fim de onCreate() não encontrado em MainApplication',
      );
    }

    const insertAt = index + marker.length;
    const snippet = `
    ${BOOT_MARKER}
    // Sobe o runtime JS mesmo quando o processo nasce por um Service (sem Activity).
    try {
      reactHost.start()
      android.util.Log.i("MainApplication", "[BGD] reactHost.start() solicitado")
    } catch (t: Throwable) {
      android.util.Log.w("MainApplication", "[BGD] Falha ao iniciar reactHost", t)
    }
    // O gatilho de headless agora é responsabilidade do IndexadorForegroundService.
`;

    contents = contents.slice(0, insertAt) + snippet + contents.slice(insertAt);
    cfg.modResults.contents = contents;
    return cfg;
  });
}

const KEEPALIVE_MARKER = '// BGD_KEEPALIVE_GUARD';

function withKeepAliveActivityGuard(config) {
  return withMainActivity(config, (cfg) => {
    let contents = cfg.modResults.contents;

    if (contents.includes(KEEPALIVE_MARKER)) {
      return cfg;
    }

    const method = `
  override fun onDestroy() {
    ${KEEPALIVE_MARKER}
    if (expo.modules.wakelock.WakeLockModule.isKeepAliveActive()) {
      android.util.Log.w("MainActivity", "[KeepAlive] Preservando runtime JS durante onDestroy")
      return
    }
    android.util.Log.i("MainActivity", "[KeepAlive] liberado; destruindo normalmente")
    super.onDestroy()
  }
`;

    const lastBrace = contents.lastIndexOf('}');
    if (lastBrace === -1) {
      throw new Error('withKeepAliveActivityGuard: fim da classe não encontrado');
    }

    contents =
      contents.slice(0, lastBrace) + method + contents.slice(lastBrace);
    cfg.modResults.contents = contents;
    return cfg;
  });
}

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

    const HEADLESS_SERVICE = 'expo.modules.wakelock.IndexingHeadlessService';
    if (!app.service.some((s) => s.$?.['android:name'] === HEADLESS_SERVICE)) {
      app.service.push({
        $: {
          'android:name': HEADLESS_SERVICE,
          'android:exported': 'false',
        },
      });
    }

    const INDEXER_SERVICE = 'expo.modules.wakelock.IndexadorForegroundService';
    const SPECIAL_USE_PROP = 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE';
    const SPECIAL_USE_SUBTYPE =
      'Indexação facial local e geração de embeddings sobre a galeria do usuário, para busca offline; iniciada pelo usuário e limitada ao processamento das fotos.';

    let indexer = app.service.find((s) => s.$?.['android:name'] === INDEXER_SERVICE);
    if (!indexer) {
      indexer = { $: { 'android:name': INDEXER_SERVICE } };
      app.service.push(indexer);
    }

    // specialUse: sem cota de 6h/24h do dataSync e sem onTimeout -> sem FGS Crashed.
    indexer.$['android:exported'] = 'false';
    indexer.$['android:stopWithTask'] = 'false';
    indexer.$['android:foregroundServiceType'] = 'specialUse';

    if (!indexer.property) indexer.property = [];
    const existingProp = indexer.property.find(
      (p) => p.$?.['android:name'] === SPECIAL_USE_PROP,
    );
    if (existingProp) {
      existingProp.$['android:value'] = SPECIAL_USE_SUBTYPE;
    } else {
      indexer.property.push({
        $: { 'android:name': SPECIAL_USE_PROP, 'android:value': SPECIAL_USE_SUBTYPE },
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

  config = withBackgroundReactHostBootstrap(config);
  config = withKeepAliveActivityGuard(config);
  return config;
};
