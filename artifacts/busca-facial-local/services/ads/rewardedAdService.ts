import {
  RewardedAd,
  RewardedAdEventType,
  AdEventType,
} from 'react-native-google-mobile-ads';
import {
  AD_CONFIG,
  isMobileAdsInitialized,
  onMobileAdsInitialized,
} from './adConfig';

let rewardedAd: RewardedAd | null = null;
let isAdLoaded = false;
let isLoading = false;
let waitingForInit = false;

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

  if (!isMobileAdsInitialized()) {
    if (!waitingForInit) {
      waitingForInit = true;
      onMobileAdsInitialized(() => {
        waitingForInit = false;
        preloadRewardedAd();
      });
    }
    return;
  }

  try {
    isLoading = true;
    const ad = getRewardedAd();

    const unsubscribeLoaded = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      isAdLoaded = true;
      isLoading = false;
      unsubscribeLoaded();
    });

    const unsubscribeError = ad.addAdEventListener(AdEventType.ERROR, () => {
      isAdLoaded = false;
      isLoading = false;
      unsubscribeError();
    });

    ad.load();
  } catch {
    isLoading = false;
  }
}

export interface ShowRewardedAdCallbacks {
  onRewardEarned: () => void;
  onAdClosed?: () => void;
  onError?: (error: Error) => void;
}

export function showRewardedAd(callbacks: ShowRewardedAdCallbacks): void {
  if (!isMobileAdsInitialized()) {
    callbacks.onError?.(new Error('Anúncios indisponíveis sem conexão.'));
    return;
  }

  try {
    const ad = getRewardedAd();

    const unsubscribeEarned = ad.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      () => {
        callbacks.onRewardEarned();
      }
    );

    const unsubscribeClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
      isAdLoaded = false;
      unsubscribeEarned();
      unsubscribeClosed();
      // Recarrega o próximo anúncio em segundo plano
      preloadRewardedAd();
      callbacks.onAdClosed?.();
    });

    const unsubscribeError = ad.addAdEventListener(AdEventType.ERROR, (error) => {
      isAdLoaded = false;
      unsubscribeEarned();
      unsubscribeClosed();
      unsubscribeError();
      callbacks.onError?.(new Error(error?.message ?? 'Erro ao exibir anúncio'));
    });

    if (isAdLoaded) {
      ad.show().catch((err) => {
        callbacks.onError?.(err instanceof Error ? err : new Error('Erro ao exibir anúncio'));
        // Se falhar na exibição, tenta carregar um novo
        isAdLoaded = false;
        preloadRewardedAd();
      });
    } else {
      // Se ainda não estava pronto, tenta carregar e exibe assim que carregar
      const onLoadedThenShow = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
        onLoadedThenShow();
        isAdLoaded = true;
        isLoading = false;
        ad.show().catch((err) => {
          callbacks.onError?.(err instanceof Error ? err : new Error('Erro ao exibir anúncio'));
        });
      });
      preloadRewardedAd();
    }
  } catch (err) {
    callbacks.onError?.(err instanceof Error ? err : new Error('Erro ao processar anúncio'));
  }
}

export function isRewardedAdReady(): boolean {
  return isAdLoaded;
}
