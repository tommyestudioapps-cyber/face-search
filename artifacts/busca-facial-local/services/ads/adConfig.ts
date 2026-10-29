import NetInfo from '@react-native-community/netinfo';

export const AD_CONFIG = {
  // IDs Oficiais do Google AdMob (Produção)
  appId: 'ca-app-pub-6305008666977043~9018991848',
  bannerAdUnitId: __DEV__ ? 'ca-app-pub-3940256099942544/6300978111' : 'ca-app-pub-6305008666977043/7729960906',
  rewardedAdUnitId: __DEV__ ? 'ca-app-pub-3940256099942544/5224354917' : 'ca-app-pub-6305008666977043/4884305710',
  isTestMode: false,
};

let adsInitialized = false;
let adsInitializing = false;
let netReconnectUnsubscribe: (() => void) | null = null;
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

function scheduleInitWhenOnline(): void {
  if (adsInitialized || netReconnectUnsubscribe) return;
  try {
    netReconnectUnsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        if (netReconnectUnsubscribe) {
          netReconnectUnsubscribe();
          netReconnectUnsubscribe = null;
        }
        void initMobileAds();
      }
    });
  } catch {
    // Ignora falhas de listener de rede de forma segura
  }
}

export async function initMobileAds(): Promise<boolean> {
  if (adsInitialized) return true;
  if (adsInitializing) return false;

  try {
    const netState = await NetInfo.fetch();
    if (!netState.isConnected || netState.isInternetReachable === false) {
      scheduleInitWhenOnline();
      return false;
    }

    adsInitializing = true;
    const mobileAds = require('react-native-google-mobile-ads').default;
    const adapterStatuses = await mobileAds().initialize();
    adsInitialized = true;
    adsInitializing = false;

    if (__DEV__) {
      console.log('[AdMob] SDK inicializado com sucesso:', adapterStatuses);
    }

    const pending = [...initCallbacks];
    initCallbacks.length = 0;
    pending.forEach((cb) => {
      try {
        cb();
      } catch {}
    });
    return true;
  } catch {
    adsInitializing = false;
    return false;
  }
}
