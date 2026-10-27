import mobileAds, { TestIds } from 'react-native-google-mobile-ads';

export const AD_CONFIG = {
  // IDs Oficiais de Teste da Google AdMob para Android
  testAppId: 'ca-app-pub-3940256099942544~3347511713',
  bannerAdUnitId: TestIds.BANNER,
  rewardedAdUnitId: TestIds.REWARDED,
  isTestMode: true,
};

let adsInitialized = false;
const initCallbacks: (() => void)[] = [];

export function isMobileAdsInitialized(): boolean {
  return adsInitialized;
}

export function onMobileAdsInitialized(cb: () => void): () => void {
  if (adsInitialized) {
    cb();
    return () => {};
  }
  initCallbacks.push(cb);
  return () => {
    const idx = initCallbacks.indexOf(cb);
    if (idx !== -1) initCallbacks.splice(idx, 1);
  };
}

export async function initMobileAds(): Promise<void> {
  if (adsInitialized) return;
  try {
    const adapterStatuses = await mobileAds().initialize();
    adsInitialized = true;
    console.log('[AdMob] SDK inicializado com sucesso:', adapterStatuses);
    initCallbacks.forEach((cb) => {
      try {
        cb();
      } catch {}
    });
    initCallbacks.length = 0;
  } catch (error) {
    console.warn('[AdMob] Erro ao inicializar SDK:', error);
  }
}
