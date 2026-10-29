import React from 'react';

export const BannerAdSize = {
  BANNER: '320x50',
  FULL_BANNER: '468x60',
  LARGE_BANNER: '320x100',
  LEADERBOARD: '728x90',
  MEDIUM_RECTANGLE: '300x250',
  ANCHORED_ADAPTIVE_BANNER: 'ANCHORED_ADAPTIVE_BANNER',
  INLINE_ADAPTIVE_BANNER: 'INLINE_ADAPTIVE_BANNER',
  WIDE_SKYSCRAPER: '160x600',
} as const;

export const TestIds = {
  BANNER: 'ca-app-pub-3940256099942544/6300978111',
  INTERSTITIAL: 'ca-app-pub-3940256099942544/1033173712',
  REWARDED: 'ca-app-pub-3940256099942544/5224354917',
  REWARDED_INTERSTITIAL: 'ca-app-pub-3940256099942544/5354046379',
  APP_OPEN: 'ca-app-pub-3940256099942544/9257395921',
} as const;

export const AdEventType = {
  LOADED: 'loaded',
  ERROR: 'error',
  OPENED: 'opened',
  CLICKED: 'clicked',
  CLOSED: 'closed',
} as const;

export const RewardedAdEventType = {
  LOADED: 'loaded',
  EARNED_REWARD: 'earned_reward',
} as const;

export class RewardedAd {
  static createForAdRequest(_adUnitId: string, _requestOptions?: unknown) {
    return new RewardedAd();
  }
  load(): void {}
  show(): Promise<void> {
    return Promise.resolve();
  }
  addAdEventListener(_event: string, _handler: (...args: any[]) => void): () => void {
    return () => {};
  }
  removeAllListeners(): void {}
}

export function BannerAd(_props: any): React.ReactElement | null {
  return null;
}

export default function mobileAds() {
  return {
    initialize: async () => [],
    setRequestConfiguration: async () => {},
    openAdInspector: async () => {},
  };
}
