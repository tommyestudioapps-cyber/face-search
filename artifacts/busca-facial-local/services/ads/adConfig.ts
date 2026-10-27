import mobileAds, { TestIds } from 'react-native-google-mobile-ads';

export const AD_CONFIG = {
  // IDs Oficiais de Teste da Google AdMob para Android
  testAppId: 'ca-app-pub-3940256099942544~3347511713',
  bannerAdUnitId: TestIds.BANNER,
  rewardedAdUnitId: TestIds.REWARDED,
  // Flag para alternar entre teste e produção no futuro
  isTestMode: true,
};

let adsInitialized = false;

export async function initMobileAds(): Promise<void> {
  if (adsInitialized) return;
  try {
    const adapterStatuses = await mobileAds().initialize();
    adsInitialized = true;
    console.log('[AdMob] SDK inicializado com sucesso:', adapterStatuses);
  } catch (error) {
    console.warn('[AdMob] Erro ao inicializar SDK:', error);
  }
}
