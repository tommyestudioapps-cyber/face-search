import mobileAds, { TestIds } from 'react-native-google-mobile-ads';

export const AD_CONFIG = {
  // IDs Oficiais do Google AdMob (Produção)
  appId: 'ca-app-pub-6305008666977043~9018991848',
  bannerAdUnitId: __DEV__ ? TestIds.BANNER : 'ca-app-pub-6305008666977043/7729960906',
  rewardedAdUnitId: __DEV__ ? TestIds.REWARDED : 'ca-app-pub-6305008666977043/4884305710',
  isTestMode: false,
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
