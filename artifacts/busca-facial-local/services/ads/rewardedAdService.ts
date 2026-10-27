import {
  RewardedAd,
  RewardedAdEventType,
  AdEventType,
} from 'react-native-google-mobile-ads';
import { AD_CONFIG } from './adConfig';

let rewardedAd: RewardedAd | null = null;
let isAdLoaded = false;
let isLoading = false;

export function getRewardedAd(): RewardedAd {
  if (!rewardedAd) {
    rewardedAd = RewardedAd.createForAdRequest(AD_CONFIG.rewardedAdUnitId, {
      requestNonPersonalizedAdsOnly: true,
    });
  }
  return rewardedAd;
}

export function preloadRewardedAd(): void {
  if (isAdLoaded || isLoading) return;

  try {
    isLoading = true;
    const ad = getRewardedAd();

    const unsubscribeLoaded = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      isAdLoaded = true;
      isLoading = false;
      console.log('[AdMob:Rewarded] Anúncio carregado e pronto para exibição');
      unsubscribeLoaded();
    });

    const unsubscribeError = ad.addAdEventListener(AdEventType.ERROR, (error) => {
      isAdLoaded = false;
      isLoading = false;
      console.warn('[AdMob:Rewarded] Falha ao carregar anúncio:', error);
      unsubscribeError();
    });

    ad.load();
  } catch (err) {
    isLoading = false;
    console.warn('[AdMob:Rewarded] Erro ao disparar load:', err);
  }
}

export interface ShowRewardedAdCallbacks {
  onRewardEarned: () => void;
  onAdClosed?: () => void;
  onError?: (error: Error) => void;
}

export function showRewardedAd(callbacks: ShowRewardedAdCallbacks): void {
  const ad = getRewardedAd();

  let earned = false;

  const unsubscribeEarned = ad.addAdEventListener(
    RewardedAdEventType.EARNED_REWARD,
    (reward) => {
      console.log('[AdMob:Rewarded] Recompensa conquistada pelo usuário:', reward);
      earned = true;
      callbacks.onRewardEarned();
    }
  );

  const unsubscribeClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
    console.log('[AdMob:Rewarded] Anúncio fechado pelo usuário');
    isAdLoaded = false;
    unsubscribeEarned();
    unsubscribeClosed();
    // Recarrega o próximo anúncio em segundo plano
    preloadRewardedAd();
    callbacks.onAdClosed?.();
  });

  const unsubscribeError = ad.addAdEventListener(AdEventType.ERROR, (error) => {
    console.warn('[AdMob:Rewarded] Erro durante a exibição:', error);
    isAdLoaded = false;
    unsubscribeEarned();
    unsubscribeClosed();
    unsubscribeError();
    callbacks.onError?.(new Error(error.message));
  });

  if (isAdLoaded) {
    ad.show().catch((err) => {
      console.warn('[AdMob:Rewarded] Erro ao chamar .show():', err);
      callbacks.onError?.(err);
      // Se falhar na exibição, tenta carregar um novo
      isAdLoaded = false;
      preloadRewardedAd();
    });
  } else {
    // Se ainda não estava pronto, tenta carregar e exibe assim que carregar
    console.log('[AdMob:Rewarded] Anúncio ainda não pronto. Carregando sob demanda...');
    const onLoadedThenShow = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      onLoadedThenShow();
      isAdLoaded = true;
      isLoading = false;
      ad.show().catch((err) => {
        callbacks.onError?.(err);
      });
    });
    preloadRewardedAd();
  }
}

export function isRewardedAdReady(): boolean {
  return isAdLoaded;
}
