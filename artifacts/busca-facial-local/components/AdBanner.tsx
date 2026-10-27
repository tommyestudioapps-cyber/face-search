import React, { useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { AD_CONFIG } from '../services/ads/adConfig';

export function AdBanner() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  if (Platform.OS === 'web' || hasError) {
    return null;
  }

  return (
    <View style={[styles.bannerContainer, !isLoaded && styles.hidden]}>
      <BannerAd
        unitId={AD_CONFIG.bannerAdUnitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{
          requestNonPersonalizedAdsOnly: true,
        }}
        onAdLoaded={() => {
          console.log('[AdMob:Banner] Banner carregado com sucesso');
          setIsLoaded(true);
        }}
        onAdFailedToLoad={(error) => {
          console.warn('[AdMob:Banner] Falha ao carregar banner:', error);
          setHasError(true);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bannerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    backgroundColor: 'transparent',
    overflow: 'hidden',
    paddingVertical: 2,
  },
  hidden: {
    height: 0,
    opacity: 0,
  },
});
