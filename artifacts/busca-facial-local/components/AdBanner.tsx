import NetInfo from '@react-native-community/netinfo';
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import {
  AD_CONFIG,
  isMobileAdsInitialized,
  onMobileAdsInitialized,
} from '../services/ads/adConfig';

export function AdBanner() {
  const [adsReady, setAdsReady] = useState(isMobileAdsInitialized());
  const [isOnline, setIsOnline] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    let mounted = true;

    NetInfo.fetch()
      .then((state) => {
        if (!mounted) return;
        const connected = Boolean(state.isConnected && state.isInternetReachable !== false);
        setIsOnline(connected);
      })
      .catch(() => {});

    const unsubNet = NetInfo.addEventListener((state) => {
      if (!mounted) return;
      const connected = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(connected);
      if (connected) {
        setHasError(false);
      } else {
        setIsLoaded(false);
      }
    });

    return () => {
      mounted = false;
      unsubNet();
    };
  }, []);

  useEffect(() => {
    if (adsReady) return undefined;
    const unsub = onMobileAdsInitialized(() => {
      setAdsReady(true);
    });
    return unsub;
  }, [adsReady]);

  if (Platform.OS === 'web' || !isOnline || hasError || !adsReady) {
    return null;
  }

  return (
    <View style={[styles.bannerContainer, !isLoaded && styles.hidden]}>
      <BannerAd
        unitId={AD_CONFIG.bannerAdUnitId}
        size={BannerAdSize.BANNER}
        requestOptions={{
          requestNonPersonalizedAdsOnly: true,
        }}
        onAdLoaded={() => {
          setIsLoaded(true);
        }}
        onAdFailedToLoad={() => {
          setIsLoaded(false);
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
    minHeight: 50,
  },
  hidden: {
    height: 0,
    minHeight: 0,
    opacity: 0,
  },
});
